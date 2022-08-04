import useSWR from 'swr'

const fetcher = (query: string) =>
  fetch('/api/graph', {
    method: 'POST',
    headers: {
      'Content-type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
    .then((res) => res.json())
    .then((json) => json.data)

export default function Index() {
  const { data, error } = useSWR('{ users { username } }', fetcher)

  if (error) return <div>Failed to load</div>
  if (!data) return <div>Loading...</div>

  const { users } = data

  return (
    <div>
      {users.map((user: any, i: number) => (
        <div key={i}>{user.username}</div>
      ))}
    </div>
  )
}