const fs = require('fs').promises

const dayjs = require('dayjs')
const { chromium } = require('playwright')
const { addRxPlugin, createRxDatabase } = require('rxdb')
const { RxDBDevModePlugin } = require('rxdb/plugins/dev-mode')
const { RxDBJsonDumpPlugin } = require('rxdb/plugins/json-dump')
const { getRxStorageMemory } = require('rxdb/plugins/storage-memory')

addRxPlugin(RxDBDevModePlugin)
addRxPlugin(RxDBJsonDumpPlugin)

const baseSchema = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: {
			type: 'string',
			maxLength: 100, // <- the primary key must have set maxLength
		},
		name: {
			type: 'string',
		},
	},
	required: ['id', 'name'],
}

;(async () => {
	// NOTE: We want to attempt to import any existing database, accounting for development editions
	const db = await createRxDatabase({
		name: 'tack',
		storage: getRxStorageMemory(),
	})

	await db.addCollections({
		clubs: {
			schema: baseSchema,
		},
		locations: {
			schema: baseSchema,
		},
		members: {
			schema: baseSchema,
		},
		vessels: {
			schema: baseSchema,
		},
		availability: {
			schema: {
				version: 0,
				primaryKey: {
					// where should the composed string be stored
					key: 'id',
					// fields that will be used to create the composed key
					fields: ['isoDate', 'locationId', 'vesselId'],
					// separator which is used to concat the fields values.
					separator: '|',
				},
				type: 'object',
				properties: {
					id: {
						type: 'string',
						maxLength: 300,
					},
					isoDate: {
						type: 'string',
						maxLength: 100,
					},
					locationId: {
						type: 'string',
						maxLength: 100,
					},
					vesselId: {
						type: 'string',
						maxLength: 100,
					},
				},
			},
		},
	})

	const context = await chromium.launchPersistentContext('./.chrome/user', {
		headless: true,
	})

	const page = await context.newPage()

	await page.goto('https://reservations.freedomboatclub.com/')

	await page.getByPlaceholder('Email address').click()
	await page.getByPlaceholder('Email address').fill(process.env.FBC_USERNAME)
	await page.getByPlaceholder('Password').click()
	await page.getByPlaceholder('Password').fill(process.env.FBC_PASSWORD)
	await page.getByRole('button', { name: 'Sign in' }).click()

	let member
	let club

	let availability

	await page.route('**/api.json/**', async (route) => {
		const request = route.request()
		const response = await page.request.fetch(request)
		const body = await response.json()

		// User && Club
		if (
			response.url().includes('users') &&
			!response.url().includes('notifications') &&
			!response.url().includes('agreements')
		) {
			console.log(`The response url for the user is ${response.url()}`)

			try {
				await db.members.upsert(body, body.id)
				body?.club && (await db.clubs.upsert(body?.club, body?.club.id))
			} catch (ex) {
				console.log(ex)
			}
		}

		if (response.url().includes('locations?regionId=')) {
			console.log(`The response url is ${response.url()}`)

			await db.locations.bulkUpsert(body.results)
		}

		if (response.url().includes('availability')) {
			console.log(`The responseurl is ${response.url()}`)
		}

		return route.fulfill({
			response,
			status: 200,
			contentType: 'application/json',
			headers: response.headers(),
			body: JSON.stringify(body),
		})
	})

	await page.waitForURL(
		'https://reservations.freedomboatclub.com/en-us/member/reservations.html',
	)
	await page.getByRole('link', { name: '+ Reserve' }).click()

	console.log(
		`Number of vessels: ${await page
			.getByRole('heading', { name: 'Monday, July 3, 2023' })
			.getByRole('listitem')
			.count()}`,
	)

	// Determine list of locations
	const locations = await db.locations
		.find({ selector: {}, sort: [{ name: 'asc' }] })
		.exec()

	if (locations.length === 0) {
		throw new Error('Failed to load any locations from the database')
	}

	// TODO: Check if we're already there...
	// Go to first location
	await page.getByRole('button', { name: locations[0].name })

	// Set Date Range
	const now = dayjs()
	const isLastDayOfCurrentMonth = now.isSame(now.endOf('month'), 'day')
	const startDay = now.add(1, day)
	const lastDay = startDay.add(29, day)

	// Click the date range component
	await page.getByLabel('Filter by Date').click()

	if (isLastDayOfCurrentMonth) {
		// Click the next month arrow
		await page.getByRole('group').getByRole('button').nth(1).click()
	}

	// Click the first day of the range
	await page.getByText(startDay.day(), { exact: true }).click()

	// The following conditional is meant to always change the page, except in the
	// case where it's the first of a month containing 31 days
	if (!(startDay.daysInMonth() === 31 && startDay.day() === 1)) {
		await page.getByRole('group').getByRole('button').nth(1).click()
	}

	// Click the last day of the range
	await page.getByText(lastDay.day(), { exact: true }).click()

	// Iterate through the headings to collect all responses
	let currentDay = startDay
	while (!lastDay.isSame(currentDay, 'day')) {
		const nextDay = currentDay.add(1, day)
		await page.getByRole('heading', { name: 'Saturday, July 8, 2023' }).click()
		currentDay = nextDay
	}

	await db
		.exportJSON()
		.then((json) => fs.writeFile('db.json', JSON.stringify(json, null, 2)))
	// ---------------------
	await context.close()
})()
