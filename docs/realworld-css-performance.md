# Realworld CSS performance

Generated: 2026-02-20T00:03:12.359Z

## Corpus selection
- corpusDir: /home/ismail-el-korchi/Documents/Projects/verge-browser/realworld/corpus
- selectedCount: 923
- topLargestLimit: 200
- randomSampleLimit: 800
- randomSeed: 0x9e3779b9
- iterationsPerCase: 3
- sourceManifestSha256: sha256:f22c2077444cb6f8bb04799fcc71d8b6865edf5170be999161a2c9d9deb6e522
- selectedSha256Hash: sha256:95d8a17f1ea2ba21f058bf7683e2555bc333b4f9a2ec4d70ff2735f1ec474b12

## Coverage
- inline-style: 124
- linked: 116
- style-attr: 683

## Parse timing
- min parse ms: 0.014
- mean parse ms: 1.713
- p50 parse ms: 0.124
- p95 parse ms: 6.934
- p99 parse ms: 39.254
- max parse ms: 97.666

## Selector query timing
- tree total nodes: 254
- tree element nodes: 253
- fixture selector qps: 15163.8
- fixture mean matches/query: 50.294118
- fixture memory retained delta MB: -0.025
- realworld selector available: yes
- realworld selector selected count: 400
- realworld selector qps: 13318.1
- realworld mean matches/query: 0.0625
- realworld memory retained delta MB: 0.006
- selector stability runs: 9
- selector stability warmupsPerRun: 1
- selector fixture median qps: 15083.6
- selector fixture qps spread: 0.26723063459651547
- selector fixture memory median delta MB: -0.025
- selector realworld median qps: 13674.7
- selector realworld qps spread: 0.11698245665352797
- selector realworld memory median delta MB: 0.006

## Error surfaces
- parserFailureCases: 0
- parserFailureRate: 0
- recoverableErrorCases: 33
- recoverableErrorRate: 0.035753
- totalCases: 923

## Target checks
- overall: ok
- parse gates: ok
- selector gates: ok
- manifest-hash-match: ok observed="sha256:f22c2077444cb6f8bb04799fcc71d8b6865edf5170be999161a2c9d9deb6e522" expected="sha256:f22c2077444cb6f8bb04799fcc71d8b6865edf5170be999161a2c9d9deb6e522"
- selected-count-min: ok observed=923 expected={"minSelectedCount":900}
- required-kinds-present: ok observed={"inline-style":124,"linked":116,"style-attr":683} expected={"requiredKinds":["inline-style","linked","style-attr"]}
- required-kind-minimums: ok observed={"inline-style":124,"linked":116,"style-attr":683} expected={"requiredKindMinimums":{"inline-style":100,"linked":100,"style-attr":600}}
- parse-p95-max: ok observed=6.934 expected={"maxParseP95Ms":10}
- parse-p99-max: ok observed=39.254 expected={"maxParseP99Ms":46}
- parse-max-max: ok observed=97.666 expected={"maxParseMaxMs":100}
- parser-failure-rate-max: ok observed=0 expected={"maxParserFailureRate":0}
- recoverable-error-rate-max: ok observed=0.035753 expected={"maxRecoverableErrorRate":0.05}
- selector-manifest-hash-match: ok observed="sha256:f22c2077444cb6f8bb04799fcc71d8b6865edf5170be999161a2c9d9deb6e522" expected="sha256:f22c2077444cb6f8bb04799fcc71d8b6865edf5170be999161a2c9d9deb6e522"
- selector-realworld-available: ok observed=true expected=true
- selector-selected-count-min: ok observed=400 expected={"minSelectedCount":400}
- selector-selected-hash-match: ok observed="sha256:3ba782c1911af1957ee216e3b815255defe66f909f3e5dec306a594f463117cf" expected="sha256:3ba782c1911af1957ee216e3b815255defe66f909f3e5dec306a594f463117cf"
- selector-tree-total-nodes-min: ok observed=254 expected={"minTreeTotalNodes":250}
- selector-tree-element-nodes-min: ok observed=253 expected={"minTreeElementNodes":250}
- selector-fixture-iterations-min: ok observed=2000 expected={"minFixtureIterations":2000}
- selector-realworld-iterations-min: ok observed=120 expected={"minRealworldIterations":120}
- selector-fixture-qps-min: ok observed=15083.6 expected={"minFixtureQueriesPerSec":13800}
- selector-realworld-qps-min: ok observed=13674.7 expected={"minRealworldQueriesPerSec":13000}
- selector-fixture-memory-retained-delta-max: ok observed=-0.025 expected={"maxFixtureMemoryRetainedDeltaMB":0.25}
- selector-realworld-memory-retained-delta-max: ok observed=0.006 expected={"maxRealworldMemoryRetainedDeltaMB":0.25}
- selector-stability-runs-min: ok observed=9 expected={"minRuns":9}
- selector-stability-warmups-min: ok observed=1 expected={"minWarmupsPerRun":1}
- selector-stability-manifest-hash-match: ok observed="sha256:f22c2077444cb6f8bb04799fcc71d8b6865edf5170be999161a2c9d9deb6e522" expected="sha256:f22c2077444cb6f8bb04799fcc71d8b6865edf5170be999161a2c9d9deb6e522"
- selector-stability-selected-hash-match: ok observed="sha256:3ba782c1911af1957ee216e3b815255defe66f909f3e5dec306a594f463117cf" expected="sha256:3ba782c1911af1957ee216e3b815255defe66f909f3e5dec306a594f463117cf"
- selector-stability-selected-count-min: ok observed=400 expected={"minSelectedCount":400}
- selector-stability-fixture-median-qps-min: ok observed=15083.6 expected={"minFixtureMedianQueriesPerSec":14500}
- selector-stability-realworld-median-qps-min: ok observed=13674.7 expected={"minRealworldMedianQueriesPerSec":13000}
- selector-stability-fixture-spread-max: ok observed=0.25039778302262056 expected={"maxFixtureSpreadFraction":0.28}
- selector-stability-realworld-spread-max: ok observed=0.07338369397500494 expected={"maxRealworldSpreadFraction":0.25}
- selector-stability-fixture-memory-median-delta-max: ok observed=-0.025 expected={"maxFixtureMedianMemoryRetainedDeltaMB":0.25}
- selector-stability-realworld-memory-median-delta-max: ok observed=0.006 expected={"maxRealworldMedianMemoryRetainedDeltaMB":0.25}

## Worst by parse time
- 79c475c307ca9d3465eb378f3ab8b2dbe7a1864f815b53f11e166300d0c5f593 kind=linked sizeBytes=489240 parseTimeMs=97.666 parseErrorCount=3 parserFailed=false
- 1b43e503b1634b7fd82bbda2aa70b05980c276de29e4bfe46c5740fbec54ef70 kind=linked sizeBytes=398265 parseTimeMs=76.532 parseErrorCount=0 parserFailed=false
- 3c2c250962822f4b1636d8616ed50b948cf97144efd7d6c3972fdffb29bedd0f kind=inline-style sizeBytes=409177 parseTimeMs=61.374 parseErrorCount=0 parserFailed=false
- b9123afe518bf96372a7603a7c356b1aa759ca45fa51cb9ac9042fe98de1b2e7 kind=linked sizeBytes=423237 parseTimeMs=60.207 parseErrorCount=0 parserFailed=false
- 80451dcc7f0d908fcbf9c5e78c722278bf0db31e3eb25f7c890b672560597a3f kind=linked sizeBytes=310451 parseTimeMs=59.423 parseErrorCount=0 parserFailed=false
- fa897efb2d6bf054279a794184fcf78815f0355b251b63f6dec2c68d77458798 kind=linked sizeBytes=243226 parseTimeMs=53.077 parseErrorCount=116 parserFailed=false
- 0801580182d8760935341373c255864a76b8def3948fd4c6ea3cfb6f0ac48c24 kind=linked sizeBytes=196878 parseTimeMs=50.548 parseErrorCount=63 parserFailed=false
- 61d3b61d29dafeff22340a01868927f29a32e6f8d0a0a118ed21cd8a6e2d8085 kind=linked sizeBytes=339347 parseTimeMs=47.703 parseErrorCount=0 parserFailed=false
- 45d3856c0840e958a841a3934c9a990aa896bc13bd993749b4482d264b9e27f0 kind=linked sizeBytes=204051 parseTimeMs=44.41 parseErrorCount=63 parserFailed=false
- 8b9a3688434a4845315f9292d68af81e312fedd89bb0258c579236817b6fcdb8 kind=linked sizeBytes=268249 parseTimeMs=44.022 parseErrorCount=0 parserFailed=false
- 620d3c1593ecb86f3f19ec026a180c826023c841889451ca3feeb38c3d03b906 kind=linked sizeBytes=202201 parseTimeMs=39.254 parseErrorCount=63 parserFailed=false
- 73c7f02ef19aa14e080b298f7d9c9dc02dc021b8a09ea04a84b52ebeefdc0d20 kind=linked sizeBytes=295654 parseTimeMs=38.044 parseErrorCount=0 parserFailed=false
- 21b214b330432922d751268f75b12ab45960506efa8561cffe8871d4ce925871 kind=linked sizeBytes=196798 parseTimeMs=37.129 parseErrorCount=63 parserFailed=false
- 566b53426cb29e46bfffdec027bf083c8f9f8434cf30649e7cc5638e4467f73c kind=linked sizeBytes=197662 parseTimeMs=37.093 parseErrorCount=63 parserFailed=false
- f0fcd6090d3fd991a0a0cfd25950ff3ea889d48aa34e1df0f2f72f4dea2ed013 kind=linked sizeBytes=184236 parseTimeMs=36.312 parseErrorCount=63 parserFailed=false
- b76c75ef320200cb8fb2d50fe88129f792d201ebfb0b4fb11ae7d567e0ac666d kind=linked sizeBytes=187559 parseTimeMs=36.165 parseErrorCount=63 parserFailed=false
- 191b0e7abe7f4a67dc41b6caa88cea0b919f864c9cba153a22a52c30057424fa kind=linked sizeBytes=199763 parseTimeMs=33.689 parseErrorCount=0 parserFailed=false
- bbebdba6d04782fa0680b8fa7c04773be71abe17d05c2da498e1b9be72d4e503 kind=linked sizeBytes=249564 parseTimeMs=28.307 parseErrorCount=0 parserFailed=false
- 26cf4d078269ab0823d4b867b45ddf2e04df0c30d2f03318abd00b98355a01d8 kind=linked sizeBytes=137010 parseTimeMs=23.361 parseErrorCount=8 parserFailed=false
- 28049996134a746ac4cf02788183fec2e9c5c7a394acdccfc6be944c5661106f kind=inline-style sizeBytes=90941 parseTimeMs=23.269 parseErrorCount=0 parserFailed=false

## Largest payloads sampled
- 79c475c307ca9d3465eb378f3ab8b2dbe7a1864f815b53f11e166300d0c5f593 kind=linked sizeBytes=489240 parseTimeMs=97.666 parseErrorCount=3 parserFailed=false
- b9123afe518bf96372a7603a7c356b1aa759ca45fa51cb9ac9042fe98de1b2e7 kind=linked sizeBytes=423237 parseTimeMs=60.207 parseErrorCount=0 parserFailed=false
- 3c2c250962822f4b1636d8616ed50b948cf97144efd7d6c3972fdffb29bedd0f kind=inline-style sizeBytes=409177 parseTimeMs=61.374 parseErrorCount=0 parserFailed=false
- 1b43e503b1634b7fd82bbda2aa70b05980c276de29e4bfe46c5740fbec54ef70 kind=linked sizeBytes=398265 parseTimeMs=76.532 parseErrorCount=0 parserFailed=false
- d89cd2bd0637ccc5b4af65448deb9c85fac1f97c7b529ccc99b7070f8377b44d kind=linked sizeBytes=349405 parseTimeMs=21.286 parseErrorCount=0 parserFailed=false
- e464e07016d8f0d88cc44b2bf23b6fd117dcbe54c937df2b12d08fc2be6df3f4 kind=linked sizeBytes=348417 parseTimeMs=20.191 parseErrorCount=0 parserFailed=false
- 61d3b61d29dafeff22340a01868927f29a32e6f8d0a0a118ed21cd8a6e2d8085 kind=linked sizeBytes=339347 parseTimeMs=47.703 parseErrorCount=0 parserFailed=false
- 80451dcc7f0d908fcbf9c5e78c722278bf0db31e3eb25f7c890b672560597a3f kind=linked sizeBytes=310451 parseTimeMs=59.423 parseErrorCount=0 parserFailed=false
- 73c7f02ef19aa14e080b298f7d9c9dc02dc021b8a09ea04a84b52ebeefdc0d20 kind=linked sizeBytes=295654 parseTimeMs=38.044 parseErrorCount=0 parserFailed=false
- 8b9a3688434a4845315f9292d68af81e312fedd89bb0258c579236817b6fcdb8 kind=linked sizeBytes=268249 parseTimeMs=44.022 parseErrorCount=0 parserFailed=false
- bbebdba6d04782fa0680b8fa7c04773be71abe17d05c2da498e1b9be72d4e503 kind=linked sizeBytes=249564 parseTimeMs=28.307 parseErrorCount=0 parserFailed=false
- fa897efb2d6bf054279a794184fcf78815f0355b251b63f6dec2c68d77458798 kind=linked sizeBytes=243226 parseTimeMs=53.077 parseErrorCount=116 parserFailed=false
- 45d3856c0840e958a841a3934c9a990aa896bc13bd993749b4482d264b9e27f0 kind=linked sizeBytes=204051 parseTimeMs=44.41 parseErrorCount=63 parserFailed=false
- 620d3c1593ecb86f3f19ec026a180c826023c841889451ca3feeb38c3d03b906 kind=linked sizeBytes=202201 parseTimeMs=39.254 parseErrorCount=63 parserFailed=false
- 191b0e7abe7f4a67dc41b6caa88cea0b919f864c9cba153a22a52c30057424fa kind=linked sizeBytes=199763 parseTimeMs=33.689 parseErrorCount=0 parserFailed=false
- 566b53426cb29e46bfffdec027bf083c8f9f8434cf30649e7cc5638e4467f73c kind=linked sizeBytes=197662 parseTimeMs=37.093 parseErrorCount=63 parserFailed=false
- 0801580182d8760935341373c255864a76b8def3948fd4c6ea3cfb6f0ac48c24 kind=linked sizeBytes=196878 parseTimeMs=50.548 parseErrorCount=63 parserFailed=false
- 21b214b330432922d751268f75b12ab45960506efa8561cffe8871d4ce925871 kind=linked sizeBytes=196798 parseTimeMs=37.129 parseErrorCount=63 parserFailed=false
- b76c75ef320200cb8fb2d50fe88129f792d201ebfb0b4fb11ae7d567e0ac666d kind=linked sizeBytes=187559 parseTimeMs=36.165 parseErrorCount=63 parserFailed=false
- f0fcd6090d3fd991a0a0cfd25950ff3ea889d48aa34e1df0f2f72f4dea2ed013 kind=linked sizeBytes=184236 parseTimeMs=36.312 parseErrorCount=63 parserFailed=false
