import { XMLParser } from 'fast-xml-parser'
import got, { CancelableRequest, Got, Response } from 'got'
import { parse as parseHtml } from 'node-html-parser'
import { CookieJar } from 'tough-cookie'

const BASE_URL = 'https://boatreservations.freedomboatclub.com'

const FBC_ID_REGEX = /(\d+)/

const DEFAULT_HEADERS = {
	Accept:
		'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.5',
	'Accept-Encoding': 'gzip, deflate, br',
	'Cache-Control': 'max-age=0',
	Connection: 'keep-alive',
	'User-Agent':
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.114 Safari/537.36 Edg/103.0.1264.62',
	'Upgrade-Insecure-Requests': '1',
}

const POST_REQUEST_HEADERS = {
	Origin: BASE_URL,
	Referrer: BASE_URL,
	'X-Requested-With': 'XMLHttpRequest',
}

export default class FBCClient {
	private _client?: Got
	private _password: string = ''
	private _username: string = ''

	private _isLoggedIn = false
	private _loginRedirect?: string | null
	private _loginRequest?: CancelableRequest<Response<string>> | null

	constructor(credentials: FBCCredentials, options: FBCOptions) {
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

	location = async (locationId: string): Promise<Location | undefined> => {
		return (await this.locations()).find(({ id }) => id === locationId)
	}

	locations = async (): Promise<Location[]> => {
		await this.login()

		return this.client()
			.get(
				`https://boatreservations.freedomboatclub.com/cp/member/53/98493/reservations/avail`,
				{
					headers: {
						Referer:
							'https://boatreservations.freedomboatclub.com/cp/member/53/98493/reservations/view',
					},
				},
			)
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

	// Available reservations
	available = async (
		locationId: string,
		opts: { classification?: Classification; date?: Date; dateEnd?: Date },
	): Promise<Reservation[]> => {
		return this.all(locationId, opts).then()
	}

	// All reservations
	all = async (
		locationId: string,
		opts: { classification?: Classification; date?: Date; dateEnd?: Date },
	): Promise<Reservation[]> => {
		await this.login()

		return [];
	}

	classifications = async (locationId: string): Promise<Classification[]> => {
		await this.login()

		return this.client()
			.post(`${BASE_URL}/brcglobal/ajax/vessels/retrieve_vessel_class.php`, {
				headers: {
					...POST_REQUEST_HEADERS,
					Accept: 'application/xml, text/xml, */*; q=0.01',
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
					Referer: `${BASE_URL}/cp/member/53/98493/reservations/avail`,
				},
				body: `club=${`53`}&location=${locationId}`,
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

		return [];
	}

	// List of current vessels (uses today's date)
	vessels = async (
		locationId: string,
		opts: { classification?: Classification; date?: Date },
	): Promise<Vessel[]> => {
		await this.login()

		return [];
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
                await this.login();

                // Make a new retry
                return retryWithMergedOptions({});
              }

							return response
						},
					],
				}
			})
		}

		return this._client
	}

	private clubAndMemberId = () => {
		// debug(`Mocking the club and memberId instead of parsing ${reservationsUrl}`)

		return { club: '53', memberId: '98493' }
	}

	private isLoggedIn = (isLoggedIn?: boolean): boolean => {
		if (isLoggedIn || isLoggedIn === false) {
			this._isLoggedIn = isLoggedIn
		}

		return this._isLoggedIn
	}

	private login = async (
		username?: string,
		password?: string,
	): Promise<void> => {
		if (!this.isLoggedIn() && !this.loginRequest()) {
			this.loginRequest(
				this.client().post(`${BASE_URL}${Endpoints.Login}`, {
					headers: {
						...POST_REQUEST_HEADERS,
						Accept: 'application/json, text/plain, */*',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						email: this.username(),
						password: this.password(),
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

export enum Endpoints {
	Home = '/',
	Login = '/rest-api/login/',
}

export enum Classification {
	FISHING_CRUISING = '6',
	// TODO: Finish classifications
}

// Interfaces

export interface Availability {
	am: boolean
	pm: boolean
}

export interface FBCCredentials {
	username: string
	password: string
}

export interface FBCOptions {}

export interface Location {
	description: string
	details?: string
	id: string
	name: string
	vessels?: Vessel[]
}

export interface LoginResponse {
	message: string
	data: {
		redirect: string
	}
}

export interface Reservation {
	isOwn: boolean
	date: Date
	hasAvailability: boolean
	availability?: Availability
}

export interface Vessel {
	id: string
	locationId: string
	name: string
	availabilities: Reservation[]
	hasAvailability: boolean
}
