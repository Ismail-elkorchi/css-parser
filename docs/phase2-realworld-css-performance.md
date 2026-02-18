# Phase 2 realworld CSS performance

Generated: 2026-02-16T23:09:06.679Z

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
- min parse ms: 0.063
- mean parse ms: 2.355
- p50 parse ms: 0.254
- p95 parse ms: 11.359
- p99 parse ms: 24.269
- max parse ms: 50.6

## Error rate
- errorCases: 58
- totalCases: 114
- errorRate: 0.508772

## Target checks
- overall: ok
- manifest-hash-match: ok observed="sha256:8bc2b8b2dc754b50021880fcfc0a2813a0c413e5afe47db5464407cd45ab15fb" expected="sha256:8bc2b8b2dc754b50021880fcfc0a2813a0c413e5afe47db5464407cd45ab15fb"
- selected-count-min: ok observed=114 expected={"minSelectedCount":114}
- required-kinds-present: ok observed={"inline-style":25,"linked":38,"style-attr":51} expected={"requiredKinds":["inline-style","linked","style-attr"]}
- required-kind-minimums: ok observed={"inline-style":25,"linked":38,"style-attr":51} expected={"requiredKindMinimums":{"inline-style":25,"linked":38,"style-attr":51}}
- parse-p95-max: ok observed=11.359 expected={"maxParseP95Ms":16.5}
- parse-p99-max: ok observed=24.269 expected={"maxParseP99Ms":28}
- parse-max-max: ok observed=50.6 expected={"maxParseMaxMs":70}
- error-rate-max: ok observed=0.508772 expected={"maxErrorRate":0.5088}

## Worst by parse time
- 21b214b330432922d751268f75b12ab45960506efa8561cffe8871d4ce925871 kind=linked sizeBytes=196798 parseTimeMs=50.6 parseErrorCount=63
- e464e07016d8f0d88cc44b2bf23b6fd117dcbe54c937df2b12d08fc2be6df3f4 kind=linked sizeBytes=348417 parseTimeMs=30.341 parseErrorCount=0
- 10e4a1bb7f96526be1c889b290f204a8056f85edb09e736d9061598c6cb7890c kind=linked sizeBytes=63129 parseTimeMs=24.269 parseErrorCount=0
- 2edf45a11a10c49b1c636eb1ee85fb82742071cd71dc99f9e342ee2538111bac kind=linked sizeBytes=109421 parseTimeMs=22.355 parseErrorCount=1
- 8e312e73b4ab8e6940ee28deec70fba656995d36155fe365985cec934ac8dbae kind=linked sizeBytes=117261 parseTimeMs=19.219 parseErrorCount=0
- d7705700d24d5919255576642ad2c28bfc790390b7183a369038ff5c1e814d51 kind=linked sizeBytes=88932 parseTimeMs=13.149 parseErrorCount=1
- 2cb75e9ee1adbe40d2ed0544b4dcf160aec3c9f37a6745f1578e67eea4116ccf kind=linked sizeBytes=44536 parseTimeMs=11.359 parseErrorCount=6
- 8818649ae2b6f5b839d19a22eaddbfd941138b5d3a60540cb0b8c23f926c8882 kind=linked sizeBytes=43408 parseTimeMs=10.896 parseErrorCount=7
- 35e36199388e7f91c71fadd3c2619b88b0144a29e30784546f453a8d6285a5be kind=linked sizeBytes=96086 parseTimeMs=9.369 parseErrorCount=0
- cc97f277693cd6797804977c15340f0901af3e04bb2737693921950de950396b kind=linked sizeBytes=31078 parseTimeMs=6.573 parseErrorCount=0
- f9b751c1cd0d2b0f91862db987fed9dda48758b15e6f42ca67796b45f4b21702 kind=linked sizeBytes=36536 parseTimeMs=6.239 parseErrorCount=6
- cd31dea0fa2438426b1b93d7b906281aef69dc8a7faba34720ba1558d6c48e63 kind=linked sizeBytes=32260 parseTimeMs=5.386 parseErrorCount=0
- e471c9385f2f3f666032af3e624aa0eee4f61ca385708c24dd319a5724fc3579 kind=linked sizeBytes=35768 parseTimeMs=4.839 parseErrorCount=0
- 928ec94d2e90fd173c73cc18e8823502ea8b12454d3c2af4d8f68ba153526b98 kind=linked sizeBytes=19715 parseTimeMs=4.724 parseErrorCount=0
- c21e5a2b32c47bc5f9d9efc97bc0e29fd081946d1d3ebffc5621cfafb1d3960e kind=linked sizeBytes=59016 parseTimeMs=3.665 parseErrorCount=0
- 83d6cbef78f20397eca531f2a309d4c330c6569bc1844712c56f78e6504953bb kind=inline-style sizeBytes=12576 parseTimeMs=3.186 parseErrorCount=6
- b105e34c08e02bb1bc3107015a8459a0076a535ec0569adfa2d877200499a16e kind=linked sizeBytes=27282 parseTimeMs=3.157 parseErrorCount=0
- 2a261e84ed61d3f5f3fffe8ab3b050a8e6439eecdafe0a65daed4f590499b5ff kind=linked sizeBytes=15219 parseTimeMs=2.872 parseErrorCount=0
- 688d89cf418a6cfa0e47edf2faacae6e1c52d6674b3c25e91d5e4982d2822668 kind=linked sizeBytes=25247 parseTimeMs=2.779 parseErrorCount=0
- 1b481752cfc8a1e7c275335e3ed1eb3645de8bbe56a1acc576a25a65f9602535 kind=linked sizeBytes=13569 parseTimeMs=2.382 parseErrorCount=0

## Largest payloads sampled
- e464e07016d8f0d88cc44b2bf23b6fd117dcbe54c937df2b12d08fc2be6df3f4 kind=linked sizeBytes=348417 parseTimeMs=30.341 parseErrorCount=0
- 21b214b330432922d751268f75b12ab45960506efa8561cffe8871d4ce925871 kind=linked sizeBytes=196798 parseTimeMs=50.6 parseErrorCount=63
- 8e312e73b4ab8e6940ee28deec70fba656995d36155fe365985cec934ac8dbae kind=linked sizeBytes=117261 parseTimeMs=19.219 parseErrorCount=0
- 2edf45a11a10c49b1c636eb1ee85fb82742071cd71dc99f9e342ee2538111bac kind=linked sizeBytes=109421 parseTimeMs=22.355 parseErrorCount=1
- 35e36199388e7f91c71fadd3c2619b88b0144a29e30784546f453a8d6285a5be kind=linked sizeBytes=96086 parseTimeMs=9.369 parseErrorCount=0
- d7705700d24d5919255576642ad2c28bfc790390b7183a369038ff5c1e814d51 kind=linked sizeBytes=88932 parseTimeMs=13.149 parseErrorCount=1
- 10e4a1bb7f96526be1c889b290f204a8056f85edb09e736d9061598c6cb7890c kind=linked sizeBytes=63129 parseTimeMs=24.269 parseErrorCount=0
- c21e5a2b32c47bc5f9d9efc97bc0e29fd081946d1d3ebffc5621cfafb1d3960e kind=linked sizeBytes=59016 parseTimeMs=3.665 parseErrorCount=0
- 2cb75e9ee1adbe40d2ed0544b4dcf160aec3c9f37a6745f1578e67eea4116ccf kind=linked sizeBytes=44536 parseTimeMs=11.359 parseErrorCount=6
- 8818649ae2b6f5b839d19a22eaddbfd941138b5d3a60540cb0b8c23f926c8882 kind=linked sizeBytes=43408 parseTimeMs=10.896 parseErrorCount=7
- f9b751c1cd0d2b0f91862db987fed9dda48758b15e6f42ca67796b45f4b21702 kind=linked sizeBytes=36536 parseTimeMs=6.239 parseErrorCount=6
- e471c9385f2f3f666032af3e624aa0eee4f61ca385708c24dd319a5724fc3579 kind=linked sizeBytes=35768 parseTimeMs=4.839 parseErrorCount=0
- cd31dea0fa2438426b1b93d7b906281aef69dc8a7faba34720ba1558d6c48e63 kind=linked sizeBytes=32260 parseTimeMs=5.386 parseErrorCount=0
- cc97f277693cd6797804977c15340f0901af3e04bb2737693921950de950396b kind=linked sizeBytes=31078 parseTimeMs=6.573 parseErrorCount=0
- b105e34c08e02bb1bc3107015a8459a0076a535ec0569adfa2d877200499a16e kind=linked sizeBytes=27282 parseTimeMs=3.157 parseErrorCount=0
- 688d89cf418a6cfa0e47edf2faacae6e1c52d6674b3c25e91d5e4982d2822668 kind=linked sizeBytes=25247 parseTimeMs=2.779 parseErrorCount=0
- 928ec94d2e90fd173c73cc18e8823502ea8b12454d3c2af4d8f68ba153526b98 kind=linked sizeBytes=19715 parseTimeMs=4.724 parseErrorCount=0
- 2a261e84ed61d3f5f3fffe8ab3b050a8e6439eecdafe0a65daed4f590499b5ff kind=linked sizeBytes=15219 parseTimeMs=2.872 parseErrorCount=0
- 3f175b06f0630ceefa92d09990e4a33233550f54e94c1e4314ab3127b39590ef kind=inline-style sizeBytes=14078 parseTimeMs=1.802 parseErrorCount=0
- 1b481752cfc8a1e7c275335e3ed1eb3645de8bbe56a1acc576a25a65f9602535 kind=linked sizeBytes=13569 parseTimeMs=2.382 parseErrorCount=0
