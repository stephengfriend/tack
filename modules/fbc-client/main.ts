import logger from '@tack/logger'
import { format, parse as parseDate, startOfTomorrow } from 'date-fns'
import { XMLParser } from 'fast-xml-parser'
import got, { CancelableRequest, Got, Response } from 'got'
import { parse as parseHtml } from 'node-html-parser'
import { CookieJar } from 'tough-cookie'

const BASE_URL = 'https://boatreservations.freedomboatclub.com'

const FBC_DATE_FORMAT = 'MM/dd/yyyy'
const FBC_DATE_REGEX = /(\d{4}-\d{2}-\d{2})/
const FBC_ID_REGEX = /(\d+)/

const DEFAULT_HEADERS = {
	Accept:
		'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.5',
	'Accept-Encoding': 'gzip, deflate, br',
	'Cache-Control': 'max-age=0',
	Connection: 'keep-alive',
	'sec-ch-ua':
		'" Not;A Brand";v="99", "Microsoft Edge";v="103", "Chromium";v="103"',
	'sec-ch-ua-mobile': '?0',
	'sec-ch-ua-platform': '"macOS"',
	'sec-fetch-dest': 'empty',
	'sec-fetch-mode': 'cors',
	'sec-fetch-site': 'same-origin',
	'User-Agent':
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.114 Safari/537.36 Edg/103.0.1264.62',
	'Upgrade-Insecure-Requests': '1',
}

const POST_REQUEST_HEADERS = {
	Origin: BASE_URL,
	Referer: BASE_URL,
	'X-Requested-With': 'XMLHttpRequest',
}

export default class FBCClient {
	private _client?: Got
	private _password: string = ''
	private _username: string = ''

	private _isLoggedIn = false
	private _loginRedirect?: string | null
	private _loginRequest?: CancelableRequest<Response<string>> | null

	constructor(credentials: FBCCredentials) {
		this.password(credentials.password)
		this.username(credentials.username)

		// this.cache = cacheManager.caching({
		// 	store: fsStore,
		// 	options: {
		// 		path: 'diskcache', //path for cached files
		// 		ttl: 60 * 60, //time to life in seconds
		// 		subdirs: true, //create subdirectories to reduce the
		// 		//files in a single dir (default: false)
		// 		zip: true, //zip files to save diskspace (default: false)
		// 	},
		// })

		this.ping()
	}

	location = async (locationId: string): Promise<Location> => {
		return await await this.locations().then((locations) => {
			const location = locations.find(({ id }) => id === locationId)

			if (!location) {
				return Promise.reject(`No location found for id ${locationId}`)
			}

			return location
		})
	}

	locations = async (): Promise<Location[]> => {
		await this.login()

		const { club, memberId } = await this.clubAndMemberId()

		return this.client()
			.get(`${BASE_URL}/cp/member/${club}/${memberId}/reservations/avail`, {
				headers: {
					Referer: `${BASE_URL}/cp/member/${club}/${memberId}/reservations/view`,
				},
			})
			.text()
			.then(parseHtml)
			.then((root) => {
				return root
					.querySelectorAll(`div.input_selection.reservations_avail`)
					.reduce((acc, ele) => {
						const onclickAttr = ele.getAttribute('onclick')

						if (!onclickAttr) {
							return acc
						}

						const id = FBC_ID_REGEX.exec(onclickAttr)?.[0]

						const indexOfOpenParens = ele.text.indexOf('(')
						const indexOfClosedParens = ele.text.indexOf(')')

						const fullName =
							indexOfOpenParens > 0
								? ele.text.substring(0, indexOfOpenParens).trim()
								: ele.text.trim()

						const [name, description] = fullName.split(' - ')

						if (!id || !name) {
							// TODO: (@stephengfriend) We should add a tracing event here
							return acc
						}

						acc.push({
							id,
							name,
							description,
							details:
								ele.text.substring(
									indexOfOpenParens + 1,
									indexOfClosedParens,
								) || undefined,
						})

						return acc
					}, [] as Location[])
			})
	}

	available = async (
		locationId: string,
		vesselId: string,
		opts: FBCOptions = { date: startOfTomorrow() },
	): Promise<Availability> => {
		await this.login()

		const { club, memberId } = await this.clubAndMemberId()

		return this.client()
			.post(`${BASE_URL}${Endpoints.Available}`, {
				headers: {
					...POST_REQUEST_HEADERS,
					Accept: 'application/xml, text/xml, */*; q=0.01',
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
					Referer: `${BASE_URL}/cp/member/${club}/${memberId}/reservations/avail`,
				},
				body: `club=${club}&member=${memberId}&location=${locationId}&date=${format(
					opts.date,
					'yyyy-MM-dd',
				)}&vessel=${vesselId}&type=reserve_confirm&notHiddenTimes=&passengers%5B%5D=73053`, // TODO: Passenger
			})
			.text()
			.then((xmlString) => new XMLParser().parse(xmlString)?.response?.html)
			.then(parseHtml)
			.then((root) => {
				const availabilities = root
					.querySelectorAll('div.reservation_button')
					.map((ele) => !!ele.getAttribute('onclick')?.includes('reserve'))

				// Weekends have separate availabilities and will return split am/pm
				const { am, pm } = {
					am: !!availabilities[0],
					pm: availabilities[1] ?? availabilities[0],
				}

				if (am && pm) {
					return Availability.FULL
				} else if (am) {
					return Availability.AM
				} else if (pm) {
					return Availability.PM
				}
				return Availability.NONE
			})
	}

	// All reservations
	all = async (
		locationId: string,
		opts: FBCOptions = { date: startOfTomorrow() },
	): Promise<Reservation[]> => {
		await this.login()

		const location = await this.location(locationId)
		const { club, memberId } = await this.clubAndMemberId()

		return this.client()
			.post(`${BASE_URL}${Endpoints.All}`, {
				headers: {
					...POST_REQUEST_HEADERS,
					Accept: 'application/xml, text/xml, */*; q=0.01',
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
					Referer: `${BASE_URL}/cp/member/${club}/${memberId}/reservations/avail`,
				},
				body: `club=${`53`}&member=${memberId}&date=${encodeURIComponent(
					format(opts.date, FBC_DATE_FORMAT),
				)}&date_end=&location=${locationId}&vessel=&def_member=${memberId}&classification=${
					opts.classification ?? ''
				}&fb_only=false`,
			})
			.text()
			.then((xmlString) => new XMLParser().parse(xmlString)?.response?.html)
			.then(parseHtml)
			.then((root) => {
				return root.querySelectorAll('div.vessel').reduce(async (acc, ele) => {
					const vessels = await acc

					const name = ele.querySelector('div.name')?.text.trim() || ''
					const onclickContents = ele
						.querySelector('.reservation_button')
						?.getAttribute('onclick')

					const id = FBC_ID_REGEX.exec(onclickContents ?? '')?.[0]
					const dateString = FBC_DATE_REGEX.exec(onclickContents ?? '')?.[0]

					if (!id || !dateString) {
						return acc
					}

					const date = parseDate(dateString, 'yyyy-MM-dd', new Date())

					const hasAvailability = !!onclickContents?.includes('reserve')

					vessels.push(
						Reservation.from({
							date,
							location,
							available: hasAvailability
								? await this.available(location.id, id, opts)
								: Availability.NONE,
							vessel: (await this.vessel(location.id, id, opts)) || { id },
						}),
					)

					return vessels
				}, Promise.resolve([] as Reservation[]))
			})
	}

	classifications = async (locationId: string): Promise<Classification[]> => {
		await this.login()

		const { club } = await this.clubAndMemberId()

		return this.client()
			.post(`${BASE_URL}${Endpoints.Classifications}`, {
				headers: {
					...POST_REQUEST_HEADERS,
					Accept: 'application/xml, text/xml, */*; q=0.01',
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
					Referer: `${BASE_URL}/cp/member/53/73052/reservations/avail`,
				},
				body: `club=${club}&location=${locationId}`,
			})
			.text()
			.then((xmlString) => new XMLParser().parse(xmlString)?.response?.html)
			.then(parseHtml)
			.then((root) => {
				return root
					.querySelectorAll(`div.input_selection`)
					.reduce((acc, ele) => {
						const id = FBC_ID_REGEX.exec(ele.getAttribute('onclick') ?? '')?.[0]
						const name = ele
							.querySelector('div.input_selection_int')
							?.text.trim()

						if (!id || !name) {
							// TODO: (@stephengfriend) We should add a tracing event here
							return acc
						}

						if (Object.values(Classification).some((c) => c === id)) {
							acc.push(id as Classification)
						} else {
							// TODO: We should log, debug, trace... whatever
						}

						return acc
					}, [] as Classification[])
			})
	}

	// List of reservations
	reservations = async (
		clubId: string,
		memberId: string,
	): Promise<Reservation[]> => {
		await this.login()

		return []
	}

	// List of current vessels (uses today's date)
	vessels = async (
		locationId: string,
		opts: { classification?: Classification; date?: Date },
	): Promise<Vessel[]> => {
		await this.login()

		return []
	}

	vessel = async (
		locationId: string,
		vesselId: string,
		opts: { classification?: Classification; date?: Date },
	): Promise<Vessel> => {
		return await this.vessels(locationId, opts).then((vessels) => {
			const vessel = vessels.find(({ id }) => id === vesselId)

			if (!vessel) {
				return Promise.reject(
					`No vessel found for id ${vesselId} at location ${locationId} on ${
						opts?.date
					}${
						opts?.classification
							? `for classification ${opts.classification}`
							: ''
					}`,
				)
			}

			return vessel
		})
	}

	private client = (client?: Got): Got => {
		if (client) {
			this._client = client
		} else if (!this._client) {
			this._client = got.extend({
				cookieJar: new CookieJar(),
				headers: {
					...DEFAULT_HEADERS,
				},
				hooks: {
					afterResponse: [
						async (response, retryWithMergedOptions) => {
							// Unauthorized
							if ([401, 403, 500].includes(response.statusCode)) {
								await this.login()

								// Make a new retry
								return retryWithMergedOptions({})
							}

							return response
						},
					],
				},
			})
		}

		return this._client
	}

	private clubAndMemberId = () => {
		// debug(`Mocking the club and memberId instead of parsing ${reservationsUrl}`)

		return { club: '53', memberId: '73052' }
	}

	private isLoggedIn = (isLoggedIn?: boolean): boolean => {
		if (isLoggedIn || isLoggedIn === false) {
			this._isLoggedIn = isLoggedIn
		}

		return this._isLoggedIn
	}

	private login = async (
		opts: {
			username: string
			password: string
		} = { username: this.username(), password: this.password() },
	): Promise<void> => {
		logger.debug(
			{
				username: opts?.username,
				password: opts?.password ? '********' : undefined,
			},
			'Attempting login with username %s',
      opts?.username
		)
		if (!this.isLoggedIn() && !this.loginRequest()) {
			this.loginRequest(
				this.client().post(`${BASE_URL}${Endpoints.Login}`, {
					headers: {
						...POST_REQUEST_HEADERS,
						Accept: 'application/json, text/plain, */*',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						email: opts?.username,
						password: opts?.password,
						remember_user: '1',
					}),
				}),
			)
		}

		const loginRequest = this.loginRequest()

		if (!this.isLoggedIn() && loginRequest) {
			const {
				data: { redirect },
			} = await loginRequest.json<LoginResponse>()

			this.isLoggedIn(true)
			this.loginRedirect(redirect)
			this.loginRequest(null)
		}
	}

	private loginRedirect = (
		loginRedirect?: string | null,
	): string | null | undefined => {
		if (loginRedirect !== undefined) {
			this._loginRedirect = loginRedirect
		}

		return this._loginRedirect
	}

	private loginRequest = (
		loginRequest?: CancelableRequest<Response<string>> | null,
	): CancelableRequest<Response<string>> | null | undefined => {
		if (loginRequest !== undefined) {
			this._loginRequest = loginRequest
		}

		return this._loginRequest
	}

	private password = (password?: string): string => {
		if (password) {
			this._password = password
		}
		return this._password
	}

	private ping = async (): Promise<boolean> => {
		let promise: Promise<any>

		const loginRedirect = this.loginRedirect()
		if (this.isLoggedIn() && loginRedirect) {
			promise = this.client().get(loginRedirect)
		} else {
			promise = this.client().get(`${BASE_URL}${Endpoints.Home}`)
		}

		return promise?.then(() => true) || false
	}

	private username = (username?: string): string => {
		if (username) {
			this._username = username
		}
		return this._username
	}
}

// Enums

export enum Availability {
	AM = 'AM',
	FULL = 'FULL',
	NONE = 'NONE',
	PM = 'PM',
	SOME = 'SOME',
}

export enum Classification {
	FISHING_CRUISING = '6',
	// TODO: Finish classifications
}

export enum Endpoints {
	All = '/brcglobal/ajax/reservations/avail_request.php',
	Available = '/brcglobal/ajax/reservations/avail.php',
	Classifications = '/brcglobal/ajax/vessels/retrieve_vessel_class.php',
	Home = '/',
	Login = '/rest-api/login/',
}

export enum EngineManufacturer {
	MERCURY = 'MERCURY',
	UNKNOWN = 'UNKNOWN',
	YAMAHA = 'YAMAHA',
}

export enum VesselManufacturer {
	BENNINGTON = 'BENNINGTON',
	MERCURY = 'MERCURY',
	UNKNOWN = 'UNKNOWN',
}

export enum VesselType {
	BAY = 'BAY',
	KAYAK = 'KAYAK',
	PONTOON = 'PONTOON',
	PADDLEBOARD = 'PADDLEBOARD',
	UNKNOWN = 'UNKNOWN',
}

// Interfaces

export interface FBCCredentials {
	username: string
	password: string
}

export interface FBCOptions {
	classification?: Classification
	date: Date
	dateEnd?: Date
}

export interface Location {
	description: string
	details?: string
	id: string
	name: string
}

export interface LoginResponse {
	message: string
	data: {
		redirect: string
	}
}

export interface Reservation {
	available?: Availability
	date: Date
	id: string
	isOwn?: boolean
	location: Location
	vessel?: Vessel
}

export interface Vessel {
	id: string
	name?: string
	details?: VesselDetails
}

export interface VesselDetails {
	bimini: boolean
	engine_hp?: number
	engine_manufacturer: EngineManufacturer
	length?: number
	livewell: boolean
	manufacturer: VesselManufacturer
	vessel_type: VesselType
}

// Classes

export class Location implements Location {
	static default = new Location('', '', '')

	constructor(id: string, name: string, description: string, details?: string) {
		this.id = id
		this.name = name
		this.description = description
		this.details = details
	}

	static from = (value: Partial<Location>): Location => {
		return { ...Location.default, ...value } as Location
	}
}

export class Vessel implements Vessel {
	static default = new Vessel('', '', '')

	constructor(id: string, name?: string, details?: string | VesselDetails) {
		this.id = id
		this.name = name
		this.details = typeof details === 'string' ? Vessel.parse(details) : details
	}

	static from(value: Partial<Vessel>): Vessel {
		return { ...Vessel.default, ...value } as Vessel
	}

	protected static parse(details: string): VesselDetails {
		let engine_manufacturer = EngineManufacturer.UNKNOWN
		let manufacturer = VesselManufacturer.UNKNOWN
		let vessel_type = VesselType.UNKNOWN

		const bimini = !details.toLowerCase().includes('no bimini')
		const length = details.match(/(\d\d)'/)?.[0] as unknown as number
		const livewell =
			!details.toLowerCase().includes('no livewell') &&
			!details.toLowerCase().includes('')

		return {
			bimini,
			engine_hp: 0,
			engine_manufacturer,
			length,
			livewell,
			manufacturer,
			vessel_type,
		}
	}
}

export class Reservation implements Reservation {
	static default: Reservation = new Reservation(
		Availability.NONE,
		startOfTomorrow(),
		Location.default,
		Vessel.default,
	)

	constructor(
		available: Availability,
		date: Date,
		location: Location,
		vessel: Vessel,
		id?: string,
	) {
		this.available = available
		this.date = date
		this.id = id || `reservation:${location.id}:${vessel.id}`
		this.location = location
		this.vessel = vessel
	}

	static from(value: Partial<Reservation>): Reservation {
		return { ...Reservation.default, ...value } as Reservation
	}

	hasAvailability() {
		return this.available !== Availability.NONE
	}
}
