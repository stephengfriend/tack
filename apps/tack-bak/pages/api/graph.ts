import { createServer } from '@graphql-yoga/node'
import FBCClient from '@tack/fbc-client'
import logger from '@tack/logger'
import type { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: {
    // Disable body parsing (required for file uploads)
    bodyParser: false,
  },
}

const typeDefs = /* GraphQL */ `
  type Query {
    all(locationId: String): [Reservation!]!
    available: Availability
    classifications: [Classification!]!
    location: Location
    locations: [Location!]!
    reservations: [Reservation!]!
    vessels: [Vessel!]!
    vessel: Vessel
  }

  type Location {
    id: ID!
    description: String!
    details: String
    name: String!
  }

  type Reservation {
    id: ID!
    available: Availability
    date: String
    isOwn: Boolean
    hasAvailability: Boolean!
    location: Location
    vessel: Vessel
  }

  type User {
    username: String
    password: String
  }

  type Vessel {
    id: ID!
    name: String
    details: VesselDetails
  }

  type VesselDetails {
    bimini: Boolean!
    engine_hp: Int
    engine_manufacturer: EngineManufacturer!
    length: Int
    livewell: Boolean!
    manufacturer: VesselManufacturer!
    vessel_type: VesselType!
  }

  enum Availability {
    AM
    FULL
    NONE
    PM
    SOME
  }

  enum Classification {
    FISHING_CRUISING
  }

  enum EngineManufacturer {
    MERCURY
    UNKNOWN
    YAMAHA
  }

  enum VesselManufacturer {
    BENNINGTON
    MERCURY
    UNKNOWN
  }

  enum VesselType {
    BAY
    KAYAK
    PONTOON
    PADDLEBOARD
    UNKNOWN
  }
`

const server = createServer<{ req: NextApiRequest, res: NextApiResponse, client: FBCClient}>({
  schema: {
    typeDefs,
    resolvers: {
      Query: {
        async all(_, args, ctx) {
          return await ctx.client.all(args.locationId)
        },
      },
    },
  },
  context: async () => ({
    client: new FBCClient({
      username: 'freedom.boat.club.9pia13iz@stephengfriend.com',
			password: 'MmZ7L3Hnuqm4rXpVR9mKZezfdcWk4JCWC',
    })
  }),
  endpoint: '/api/graph',
  // graphiql: false // uncomment to disable GraphiQL
})

export default server
