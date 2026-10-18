import test from 'node:test'
import assert from 'node:assert/strict'
import { clipStreetSegment, highlightRadius, nearbyStreetFeatures } from '../src/services/affectedStreets.js'
test('street segments are clipped to the marker circle, retaining bends without synthetic crosshairs', () => {
  assert.deepEqual(clipStreetSegment({x:-20,y:0}, {x:20,y:0}, {x:0,y:0}, 10), [{x:-10,y:0},{x:10,y:0}])
  assert.equal(clipStreetSegment({x:-20,y:11}, {x:20,y:11}, {x:0,y:0}, 10), null)
  assert.deepEqual(clipStreetSegment({x:0,y:0}, {x:3,y:4}, {x:0,y:0}, 10), [{x:0,y:0},{x:3,y:4}])
  assert.equal(highlightRadius(16) / highlightRadius(15), 2)
  const road = {geometry:{type:'LineString',coordinates:[[-.003,0],[0,0],[0,.003]]}}
  const map = { getZoom:()=>16, getContainer:()=>({clientWidth:500,clientHeight:500}), getStyle:()=>({layers:[{id:'road',type:'line'},{id:'roadsafe-personnel-route',type:'line'}]}), project:([x,y])=>({x,y}), unproject:([lng,lat])=>({lng,lat}), queryRenderedFeatures:(_box, {layers})=>{ assert.deepEqual(layers,['road']); return [road,road] } }
  const reports = {features:[{id:'r',geometry:{coordinates:[0,0]},properties:{caseColor:'#ff0000'}}]}
  const result = nearbyStreetFeatures(map,reports)
  assert.equal(result.features.length,2)
  for (const feature of result.features) for (const [x,y] of feature.geometry.coordinates) assert.ok(Math.hypot(x,y)*111320<=150.01)
  assert.deepEqual(nearbyStreetFeatures({...map,getZoom:()=>13},reports),result, 'zooming out must not expand or change the clipped geographic street segments')
  const outsideRoad = {geometry:{type:'LineString',coordinates:[[-.003,.002],[.003,.002]]}}
  assert.equal(nearbyStreetFeatures({...map,queryRenderedFeatures:()=>[outsideRoad]},reports).features.length,0, 'a street beyond 150m stays excluded even if returned by a lower zoom tile')
  assert.equal(nearbyStreetFeatures({...map,getZoom:()=>12},reports).features.length,0)
})
