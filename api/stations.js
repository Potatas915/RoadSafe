import { readFile } from 'node:fs/promises'
import { stationMiddleware } from '../server/stations.mjs'

export default stationMiddleware(fetch, type => ({
  preferSaved: true,
  read: async () => JSON.parse(await readFile(new URL(`../server/station-snapshots/${type}-philippines.json`, import.meta.url), 'utf8')),
}))
