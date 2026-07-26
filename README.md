# woodsdev Simple Tools

A small collection of single-purpose tools that run entirely in the browser. No backend, no build step, no dependencies. Plain HTML, CSS and vanilla JS, served by nginx.

Current tools:

- JSON to CSV converter (works in both directions)
- JSON beautifier / minifier
- Markup & margin calculator
- Percentage calculators
- Co-term pricing calculator
- Microsoft tenant ID lookup
- Code comment remover

All the logic runs client side and nothing goes through a server of mine. The only tool that talks to the outside world is the tenant ID lookup, which queries Microsoft's public login endpoint directly from your browser.

## Running locally

Any static file server will do. From the repo root:

```
python -m http.server 8000
```

Then open http://localhost:8000.

One thing to watch: the pages use root-absolute paths (`/styles.css`, `/pages/...`), so serve from the repo root rather than opening the HTML files straight off disk.

To test with the real nginx config (CSP headers, caching and so on):

```
docker build -t simpletools .
docker run --rm -p 8080:80 simpletools
```

Then open http://localhost:8080.

## Deploying

Production runs through docker compose with a Cloudflare tunnel in front, so no ports are published on the host. Put your tunnel token in a `.env` file next to the compose file:

```
TUNNEL_TOKEN=your-token-here
```

Then:

```
docker compose up -d --build
```

Map a public hostname to the tunnel in the Cloudflare Zero Trust dashboard and you're done.

## Project layout

```
index.html         hub page
styles.css         shared styles for every page
pages/<tool>/      one folder per tool (index.html + script.js)
assets/images/     logo files
assets/nav.js      dropdown toggling for the shared nav
nginx.conf         server config, including the CSP
```

## Adding a tool

1. Copy one of the folders under `pages/` and rename it.
2. Add a nav link on each page and a card on the hub.
3. If it should have its own accent colour, add a `theme-*` block near the top of `styles.css` and set the class on the page's `<body>`.

The CSP in `nginx.conf` blocks inline scripts and styles, so keep all JS and CSS in separate files or the browser will refuse to run it.

## Disclaimer

Personal project, provided as is. See the footer on any page for the full wording.
