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
  const { data, error } = useSWR('{ all(locationId: "1") { id } }', fetcher)

  if (error) return <div>Failed to load</div>
  if (!data) return <div>Loading...</div>

  const { all } = data

  return (
    <div>
      {all.map((vessel: any, i: number) => (
        <div key={i}>{JSON.stringify(vessel)}</div>
      ))}
    </div>
  )
}
