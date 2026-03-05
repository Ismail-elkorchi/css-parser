# First Parse Success

This tutorial shows the shortest path to parse CSS and run deterministic selector queries.

## Step 1: Parse CSS

```ts
import { parse } from "@ismail-elkorchi/css-parser";

const tree = parse(".card { color: red; }");
console.log(tree.kind);
```

Expected output:

```txt
stylesheet
```

## Step 2: Serialize parsed output

```ts
import { parse, serialize } from "@ismail-elkorchi/css-parser";

const tree = parse(".card { color: red; }");
console.log(serialize(tree));
```

Expected output:

```txt
.card{color:red}
```

## Step 3: Run examples

```bash
npm run examples:run
```

What you get:
- Confirmation that packaged examples run on your local build.
