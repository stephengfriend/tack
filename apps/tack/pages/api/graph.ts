import { createServer } from '@graphql-yoga/node'
import type { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: {
    // Disable body parsing (required for file uploads)
    bodyParser: false,
  },
}

const typeDefs = /* GraphQL */ `
  type Query {
    users: [User!]!
  }

  type Location {
    id: String
  }

  type Reservation {
    id: String
  }

  type User {
    username: String
    password: String
  }

  type Vessel {
    id: String
  }
`

const resolvers = {
  Query: {
    users() {
      return [{ username: 'Nextjs', password: '********' }]
    },
  },
}

const server = createServer<{ req: NextApiRequest, res: NextApiResponse}>({
  schema: {
    typeDefs,
    resolvers,
  },
  endpoint: '/api/graph',
  // graphiql: false // uncomment to disable GraphiQL
})

export default server