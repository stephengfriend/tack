import got from 'got'

const BASE_URL = 'https://boatreservations.freedomboatclub.com'

export default class FBCClient {
  private _password;
  private _username;

  private _isLoggedIn = false;
  private _loginRedirect?: string;
  private _loginRequest?: Promise<Response>;

  constructor(credentials: FBCCredentials, options: FBCOptions) {
    this._password = credentials.password;
    this._username = credentials.username;

    this.cache = cacheManager.caching({
      store: fsStore,
      options: {
        path: "diskcache", //path for cached files
        ttl: 60 * 60, //time to life in seconds
        subdirs: true, //create subdirectories to reduce the
        //files in a single dir (default: false)
        zip: true, //zip files to save diskspace (default: false)
      },
    });

    this.ping();
  }

  // Core

  private login = async (username?: string, password?: string): Promise<void> => {};

  private ping = async (): Promise<boolean> => {
    let prms: Promise<any>;

    if (this.isLoggedIn && this._loginRedirect) {
      prms = got(`${BASE_URL}${Endpoints.Home}`, {
        headers: {
          ...DEFAULT_HEADERS,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
        },
      }).json().catch((err) => {
        this._isLoggedIn = false;
        this._loginRedirect = undefined;
        this._loginRequest = undefined;
      })
    } else {
      prms = got(`${BASE_URL}${Endpoints.Home}`, {
        headers: {
          ...DEFAULT_HEADERS,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
        },
      }).text()
    }

    return prms?.then(() => true) || false;
  };

	location = async (locationId: string): Promise<Location> => {};

  locations = async (): Promise<Location[]> => {};

  // Available reservations
  available = async (
    locationId: string,
    date?: Date,
    classification?: string,
    dateEnd?: Date
  ): Promise<Reservation[]> => {};

  // All reservations
  all = async (
    locationId: string,
    date?: Date,
    classification?: string,
    dateEnd?: Date
  ): Promise<Reservation[]> => {};

  // List of reservations
  reservations = async (
    clubId: string,
    memberId: string
  ): Promise<Reservation[]> => {};

  // List of current vessels (uses today's date)
  vessels = async (
    locationId: string,
    opts: { classification?: Classification; date?: Date }
  ): Promise<Vessel[]> => {};
  
  // Getters/Setters

  password = (password: string): void => {
    // TODO: Validation
    this._password = password;
  };

  username = (username?: string): string => {
    if (username) {
      this._username = username;
    }
    return this._username;
  }
}

// Enums

export enum Endpoints {
  Home = '/',
  Login = '/rest-api/login/',
}

export enum Classification {
  FISHING_CRUISING = "6",
  // TODO: Finish classifications
}

// Interfaces

export interface Availability {
	am: boolean
	pm: boolean
}

export interface FBCCredentials {
  username: string;
  password: string;
}

export interface FBCOptions {}

export interface Location {
	description: string
	details?: string
	id: number
	name: string
	vessels?: Vessel[]
}

export interface Reservation {
	date: Date
	hasAvailability: boolean
	availability?: Availability
}

export interface Vessel {
	id: number
	locationId: number
	name: string
	availabilities: Reservation[]
	hasAvailability: boolean
}