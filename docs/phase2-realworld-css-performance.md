# Phase 2 realworld CSS performance

Generated: 2026-02-17T00:28:03.687Z

## Corpus selection
- corpusDir: /home/ismail-el-korchi/Documents/Projects/verge-browser/realworld/corpus
- selectedCount: 114
- topLargestLimit: 200
- randomSampleLimit: 800
- randomSeed: 0x9e3779b9
- iterationsPerCase: 3
- sourceManifestSha256: sha256:8bc2b8b2dc754b50021880fcfc0a2813a0c413e5afe47db5464407cd45ab15fb
- selectedSha256Hash: sha256:5c1f8fb75bc73d49c46ad14f941d7e51dd64a37af75b0427139c719ac675776d

## Coverage
- inline-style: 25
- linked: 38
- style-attr: 51

## Parse timing
- min parse ms: 0.076
- mean parse ms: 2.598
- p50 parse ms: 0.281
- p95 parse ms: 11.455
- p99 parse ms: 24.388
- max parse ms: 60.352

## Selector query timing
- tree total nodes: 254
- tree element nodes: 253
- fixture selector qps: 13583.9
- fixture mean matches/query: 50.294118
- realworld selector available: yes
- realworld selector selected count: 400
- realworld selector qps: 12530.6
- realworld mean matches/query: 0.125
- selector stability runs: 9
- selector stability warmupsPerRun: 1
- selector fixture median qps: 13148.1
- selector fixture qps spread: 0.18630828788950496
- selector realworld median qps: 12530.6
- selector realworld qps spread: 0.1782995227682632

## Error rate
- errorCases: 58
- totalCases: 114
- errorRate: 0.508772

## Target checks
- overall: ok
- parse gates: ok
- selector gates: ok
- manifest-hash-match: ok observed="sha256:8bc2b8b2dc754b50021880fcfc0a2813a0c413e5afe47db5464407cd45ab15fb" expected="sha256:8bc2b8b2dc754b50021880fcfc0a2813a0c413e5afe47db5464407cd45ab15fb"
- selected-count-min: ok observed=114 expected={"minSelectedCount":114}
- required-kinds-present: ok observed={"inline-style":25,"linked":38,"style-attr":51} expected={"requiredKinds":["inline-style","linked","style-attr"]}
- required-kind-minimums: ok observed={"inline-style":25,"linked":38,"style-attr":51} expected={"requiredKindMinimums":{"inline-style":25,"linked":38,"style-attr":51}}
- parse-p95-max: ok observed=11.455 expected={"maxParseP95Ms":16.5}
- parse-p99-max: ok observed=24.388 expected={"maxParseP99Ms":28}
- parse-max-max: ok observed=60.352 expected={"maxParseMaxMs":70}
- error-rate-max: ok observed=0.508772 expected={"maxErrorRate":0.5088}
- selector-manifest-hash-match: ok observed="sha256:8bc2b8b2dc754b50021880fcfc0a2813a0c413e5afe47db5464407cd45ab15fb" expected="sha256:8bc2b8b2dc754b50021880fcfc0a2813a0c413e5afe47db5464407cd45ab15fb"
- selector-realworld-available: ok observed=true expected=true
- selector-selected-count-min: ok observed=400 expected={"minSelectedCount":400}
- selector-selected-hash-match: ok observed="sha256:9a10b7ee01a1ba4c20b133c04e7daf30a37199e806995758fe25f91a3bd1ec0f" expected="sha256:9a10b7ee01a1ba4c20b133c04e7daf30a37199e806995758fe25f91a3bd1ec0f"
- selector-tree-total-nodes-min: ok observed=254 expected={"minTreeTotalNodes":250}
- selector-tree-element-nodes-min: ok observed=253 expected={"minTreeElementNodes":250}
- selector-fixture-iterations-min: ok observed=2000 expected={"minFixtureIterations":2000}
- selector-realworld-iterations-min: ok observed=120 expected={"minRealworldIterations":120}
- selector-fixture-qps-min: ok observed=13583.9 expected={"minFixtureQueriesPerSec":9000}
- selector-realworld-qps-min: ok observed=12530.6 expected={"minRealworldQueriesPerSec":8500}
- selector-fixture-memory-retained-max: ok observed=9.766 expected={"maxFixtureMemoryRetainedMB":11}
- selector-realworld-memory-retained-max: ok observed=9.76 expected={"maxRealworldMemoryRetainedMB":11}
- selector-stability-runs-min: ok observed=9 expected={"minRuns":9}
- selector-stability-warmups-min: ok observed=1 expected={"minWarmupsPerRun":1}
- selector-stability-manifest-hash-match: ok observed="sha256:8bc2b8b2dc754b50021880fcfc0a2813a0c413e5afe47db5464407cd45ab15fb" expected="sha256:8bc2b8b2dc754b50021880fcfc0a2813a0c413e5afe47db5464407cd45ab15fb"
- selector-stability-selected-hash-match: ok observed="sha256:9a10b7ee01a1ba4c20b133c04e7daf30a37199e806995758fe25f91a3bd1ec0f" expected="sha256:9a10b7ee01a1ba4c20b133c04e7daf30a37199e806995758fe25f91a3bd1ec0f"
- selector-stability-selected-count-min: ok observed=400 expected={"minSelectedCount":400}
- selector-stability-fixture-median-qps-min: ok observed=13148.1 expected={"minFixtureMedianQueriesPerSec":13000}
- selector-stability-realworld-median-qps-min: ok observed=12530.6 expected={"minRealworldMedianQueriesPerSec":12500}
- selector-stability-fixture-spread-max: ok observed=0.18630828788950496 expected={"maxFixtureSpreadFraction":0.55}
- selector-stability-realworld-spread-max: ok observed=0.1782995227682632 expected={"maxRealworldSpreadFraction":0.45}
- selector-stability-fixture-memory-median-max: ok observed=9.762 expected={"maxFixtureMedianMemoryRetainedMB":10.5}
- selector-stability-realworld-memory-median-max: ok observed=9.756 expected={"maxRealworldMedianMemoryRetainedMB":10.5}

## Worst by parse time
- 21b214b330432922d751268f75b12ab45960506efa8561cffe8871d4ce925871 kind=linked sizeBytes=196798 parseTimeMs=60.352 parseErrorCount=63
- e464e07016d8f0d88cc44b2bf23b6fd117dcbe54c937df2b12d08fc2be6df3f4 kind=linked sizeBytes=348417 parseTimeMs=33.304 parseErrorCount=0
- 10e4a1bb7f96526be1c889b290f204a8056f85edb09e736d9061598c6cb7890c kind=linked sizeBytes=63129 parseTimeMs=24.388 parseErrorCount=0
- 8e312e73b4ab8e6940ee28deec70fba656995d36155fe365985cec934ac8dbae kind=linked sizeBytes=117261 parseTimeMs=23.274 parseErrorCount=0
- 2edf45a11a10c49b1c636eb1ee85fb82742071cd71dc99f9e342ee2538111bac kind=linked sizeBytes=109421 parseTimeMs=20.275 parseErrorCount=1
- d7705700d24d5919255576642ad2c28bfc790390b7183a369038ff5c1e814d51 kind=linked sizeBytes=88932 parseTimeMs=16.095 parseErrorCount=1
- 2cb75e9ee1adbe40d2ed0544b4dcf160aec3c9f37a6745f1578e67eea4116ccf kind=linked sizeBytes=44536 parseTimeMs=11.455 parseErrorCount=6
- 8818649ae2b6f5b839d19a22eaddbfd941138b5d3a60540cb0b8c23f926c8882 kind=linked sizeBytes=43408 parseTimeMs=10.864 parseErrorCount=7
- 35e36199388e7f91c71fadd3c2619b88b0144a29e30784546f453a8d6285a5be kind=linked sizeBytes=96086 parseTimeMs=10.551 parseErrorCount=0
- f9b751c1cd0d2b0f91862db987fed9dda48758b15e6f42ca67796b45f4b21702 kind=linked sizeBytes=36536 parseTimeMs=7.615 parseErrorCount=6
- 2a261e84ed61d3f5f3fffe8ab3b050a8e6439eecdafe0a65daed4f590499b5ff kind=linked sizeBytes=15219 parseTimeMs=6.639 parseErrorCount=0
- cc97f277693cd6797804977c15340f0901af3e04bb2737693921950de950396b kind=linked sizeBytes=31078 parseTimeMs=5.717 parseErrorCount=0
- 688d89cf418a6cfa0e47edf2faacae6e1c52d6674b3c25e91d5e4982d2822668 kind=linked sizeBytes=25247 parseTimeMs=5.617 parseErrorCount=0
- e471c9385f2f3f666032af3e624aa0eee4f61ca385708c24dd319a5724fc3579 kind=linked sizeBytes=35768 parseTimeMs=4.994 parseErrorCount=0
- cd31dea0fa2438426b1b93d7b906281aef69dc8a7faba34720ba1558d6c48e63 kind=linked sizeBytes=32260 parseTimeMs=4.476 parseErrorCount=0
- 928ec94d2e90fd173c73cc18e8823502ea8b12454d3c2af4d8f68ba153526b98 kind=linked sizeBytes=19715 parseTimeMs=4.039 parseErrorCount=0
- c21e5a2b32c47bc5f9d9efc97bc0e29fd081946d1d3ebffc5621cfafb1d3960e kind=linked sizeBytes=59016 parseTimeMs=3.741 parseErrorCount=0
- 83d6cbef78f20397eca531f2a309d4c330c6569bc1844712c56f78e6504953bb kind=inline-style sizeBytes=12576 parseTimeMs=3.356 parseErrorCount=6
- b105e34c08e02bb1bc3107015a8459a0076a535ec0569adfa2d877200499a16e kind=linked sizeBytes=27282 parseTimeMs=2.966 parseErrorCount=0
- 1b481752cfc8a1e7c275335e3ed1eb3645de8bbe56a1acc576a25a65f9602535 kind=linked sizeBytes=13569 parseTimeMs=2.319 parseErrorCount=0

## Largest payloads sampled
- e464e07016d8f0d88cc44b2bf23b6fd117dcbe54c937df2b12d08fc2be6df3f4 kind=linked sizeBytes=348417 parseTimeMs=33.304 parseErrorCount=0
- 21b214b330432922d751268f75b12ab45960506efa8561cffe8871d4ce925871 kind=linked sizeBytes=196798 parseTimeMs=60.352 parseErrorCount=63
- 8e312e73b4ab8e6940ee28deec70fba656995d36155fe365985cec934ac8dbae kind=linked sizeBytes=117261 parseTimeMs=23.274 parseErrorCount=0
- 2edf45a11a10c49b1c636eb1ee85fb82742071cd71dc99f9e342ee2538111bac kind=linked sizeBytes=109421 parseTimeMs=20.275 parseErrorCount=1
- 35e36199388e7f91c71fadd3c2619b88b0144a29e30784546f453a8d6285a5be kind=linked sizeBytes=96086 parseTimeMs=10.551 parseErrorCount=0
- d7705700d24d5919255576642ad2c28bfc790390b7183a369038ff5c1e814d51 kind=linked sizeBytes=88932 parseTimeMs=16.095 parseErrorCount=1
- 10e4a1bb7f96526be1c889b290f204a8056f85edb09e736d9061598c6cb7890c kind=linked sizeBytes=63129 parseTimeMs=24.388 parseErrorCount=0
- c21e5a2b32c47bc5f9d9efc97bc0e29fd081946d1d3ebffc5621cfafb1d3960e kind=linked sizeBytes=59016 parseTimeMs=3.741 parseErrorCount=0
- 2cb75e9ee1adbe40d2ed0544b4dcf160aec3c9f37a6745f1578e67eea4116ccf kind=linked sizeBytes=44536 parseTimeMs=11.455 parseErrorCount=6
- 8818649ae2b6f5b839d19a22eaddbfd941138b5d3a60540cb0b8c23f926c8882 kind=linked sizeBytes=43408 parseTimeMs=10.864 parseErrorCount=7
- f9b751c1cd0d2b0f91862db987fed9dda48758b15e6f42ca67796b45f4b21702 kind=linked sizeBytes=36536 parseTimeMs=7.615 parseErrorCount=6
- e471c9385f2f3f666032af3e624aa0eee4f61ca385708c24dd319a5724fc3579 kind=linked sizeBytes=35768 parseTimeMs=4.994 parseErrorCount=0
- cd31dea0fa2438426b1b93d7b906281aef69dc8a7faba34720ba1558d6c48e63 kind=linked sizeBytes=32260 parseTimeMs=4.476 parseErrorCount=0
- cc97f277693cd6797804977c15340f0901af3e04bb2737693921950de950396b kind=linked sizeBytes=31078 parseTimeMs=5.717 parseErrorCount=0
- b105e34c08e02bb1bc3107015a8459a0076a535ec0569adfa2d877200499a16e kind=linked sizeBytes=27282 parseTimeMs=2.966 parseErrorCount=0
- 688d89cf418a6cfa0e47edf2faacae6e1c52d6674b3c25e91d5e4982d2822668 kind=linked sizeBytes=25247 parseTimeMs=5.617 parseErrorCount=0
- 928ec94d2e90fd173c73cc18e8823502ea8b12454d3c2af4d8f68ba153526b98 kind=linked sizeBytes=19715 parseTimeMs=4.039 parseErrorCount=0
- 2a261e84ed61d3f5f3fffe8ab3b050a8e6439eecdafe0a65daed4f590499b5ff kind=linked sizeBytes=15219 parseTimeMs=6.639 parseErrorCount=0
- 3f175b06f0630ceefa92d09990e4a33233550f54e94c1e4314ab3127b39590ef kind=inline-style sizeBytes=14078 parseTimeMs=2.103 parseErrorCount=0
- 1b481752cfc8a1e7c275335e3ed1eb3645de8bbe56a1acc576a25a65f9602535 kind=linked sizeBytes=13569 parseTimeMs=2.319 parseErrorCount=0
