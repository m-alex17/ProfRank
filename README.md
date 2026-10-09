# ProfRank

Find and rank researchers and universities in any country (or one university) by how well their recent papers match **your** research interests. Built for prospective PhD students looking for supervisors. It is a single web page with no install, no server and no build step: everything runs in your browser and talks only to the free [OpenAlex](https://openalex.org) API.

Works for any field OpenAlex covers (computer science, management, engineering, humanities, medicine, and so on). See [Using it for other fields](#using-it-for-other-fields).

## Quick start

1. Get a **free OpenAlex API key**: create an account at [openalex.org](https://openalex.org), then copy the key from [openalex.org/settings/api](https://openalex.org/settings/api).
2. Open `index.html` in Chrome, Edge or Firefox (double-click it), or host it with GitHub Pages.
3. Paste your key, choose a country, and either click **Load an example...** or write your own topics.
4. Press **Run**. You get top-university cards, a sortable and searchable table, and a CSV download.

Settings are stored in your browser only (localStorage). The only network requests go to `api.openalex.org`.

## Tutorial

> All screenshots and the video use **simulated data with fictional people**, because they were produced without calling OpenAlex. Your results will show real researchers.

![Full walkthrough](docs/demo.gif)

The same walkthrough as a smaller video: [docs/demo.mp4](docs/demo.mp4).

**1. Start.** Open `index.html`. The page has three steps: choose where to look, describe your interests, run.

![Landing page](docs/screenshots/01_landing.png)

**2. Pick a country.** Click the country box and type to search. The list is alphabetical and European countries carry a tag. Click a name, or press Enter.

![Country search](docs/screenshots/02_country_search.png)

**3. Add your API key and basic settings.** Paste your free OpenAlex key (it is stored in your browser only). Set the start year, how many universities to feature, the minimum score and, optionally, a research field.

![Settings](docs/screenshots/03_settings.png)

**4. Advanced options (optional).** Minimum matching papers, researchers per university, author-order handling, favoured venues, research institutes.

![Advanced options](docs/screenshots/04_advanced.png)

**5. Describe your interests.** Load one of the built-in examples or write your own topics. Each topic has a weight (how much it matters) and one keyword or phrase per line.

![Topics](docs/screenshots/05_topics.png)

**6. People and universities (optional).** Add names you already know under "Always check these people". To search one university only, type its name, press **Find** and pick a match. Clear the box to go back to the whole country.

![Watchlist and single university](docs/screenshots/06_watchlist_university.png)

**7. Run.** Progress and the latest status message appear in the bottom bar; the full log is under "Show log".

![Running](docs/screenshots/07_running.png)

**8. Read the results.** Top universities come first, each with its best-matching people and a score (100 = best match in this run).

![Results](docs/screenshots/08_results.png)

**9. Explore.** Sort and search the full table. Click a row to see the matching papers and a link to find the person's university page. Download everything as CSV.

![Row details](docs/screenshots/09_details.png)

**10. Light or dark.** The toggle in the top-right corner switches theme; the choice is remembered.

![Dark theme](docs/screenshots/10_dark_theme.png)

To regenerate these images and the video after changing the interface: `pip install playwright && playwright install chromium && python docs/capture.py`.

## How it works

1. **Watchlist.** Each name in "Always check these people" is looked up and kept only if currently affiliated in the chosen country or university.
2. **Search.** For each topic, its keywords are OR-ed into one title-and-abstract search, filtered by year, country (or university) and optionally research field. Results are paged (200 per page, up to 10 pages per topic). Watchlist people get an extra search without the country filter, so work done elsewhere is not lost.
3. **Profiles.** Papers are credited to authors affiliated with a university in the country, de-duplicated by title.
4. **Score, filter, rank** researchers, then universities.

## Scoring

Each paper's weight is the product of:

| Factor | Rule |
|---|---|
| Recency | halves every 4 years |
| Citations | `1 + 0.15 x ln(1 + citations)` |
| Author order (optional) | first 1.0, middle 0.85, last 1.25 |
| Favoured venues (optional) | x1.25 if the venue name contains one of your listed phrases |

Per researcher: `topic weight x sqrt(sum of paper weights)` for each topic, summed, then scaled so the best researcher is **100** (scores are relative). A university's score is the sum of its top 5 researchers' scores.

A topic's weight applies to **all** its keywords. Keywords are OR-ed, and one paper counts once per topic. For finer control, split keywords into separate topics with different weights.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| Country | Canada | Where researchers must be affiliated |
| Papers since year | 2018 | Older papers are ignored |
| Universities to feature | 5 | Number of top-university cards |
| Min. score | 5 | Cutoff relative to the best match; lower means more people and more noise |
| Research field | Any field | Restricts papers to one OpenAlex field (26 available) |
| OpenAlex API key | empty | Strongly recommended, see API limits |
| *Advanced:* min. matching papers | 1 | Drops people with fewer matching papers (watchlist exempt) |
| *Advanced:* professors per university | 8 | People listed on each card |
| *Advanced:* max researchers to keep | 60 | Cap after the cutoff |
| *Advanced:* author order | last = leader | Turn off for fields where author order carries no meaning |
| *Advanced:* favoured venues | none | Optional phrases, one per line |
| *Advanced:* research institutes | off | Include non-university groups |
| Always check these people | empty | One name per line |
| Check one university only | empty | Type a name, press **Find**, pick a match |
| Topics | one empty topic | Name, weight and keywords; or load an example |

Built-in examples: software engineering, business and management, mining and geoscience, literature and humanities.

### Single-university mode
Searches only that institution **and its sub-units** (faculties, departments, institutes), ignores the country setting, and lists everyone under that university's name. It uses fewer API calls than a country-wide search. Clear the box to go back to country mode.

## Using it for other fields

OpenAlex covers all disciplines, so the pipeline works anywhere. Adjust these to the field:
- **Research field**: pick it (for example *Business, Management & Accounting*, *Arts & Humanities*) to keep out unrelated papers. Use *Any field* when your keywords are specific enough, or when the discipline spans fields (for example mining engineering).
- **Author order**: the "last author is the leader" boost fits lab sciences and engineering. In humanities, management, economics and mathematics, author order is often alphabetical or meaningless, so choose *Ignore author order*.
- **Keywords**: more specific phrases work better. Generic words ("management", "mining") pull in unrelated papers; "data mining" and "mineral processing" mean very different things.
- **Coverage**: humanities and book-based fields are covered less well (books, chapters, missing abstracts), so expect fewer and noisier results than in the sciences.

## API limits

OpenAlex now expects an API key. Without one, the tiny daily allowance is shared by everyone on your network (about one run). A free key gives roughly 10x that. The allowance resets at **midnight UTC**; the page shows the reset time in your local time when the limit is hit. To save calls: fewer topics and keywords, a later start year, or single-university mode.

## Limitations

- **No job titles.** Results come from papers, not faculty lists, so they include PhD students and postdocs and miss professors with no matching papers in the period. Always confirm on the university's page.
- **Affiliation is per paper.** Recent movers have older papers under another country; use the watchlist for people you already know.
- **Author profiles are algorithmic.** OpenAlex sometimes merges or splits similar names.
- **Admissions and funding are not checked.** Check the PhD page or the specific call.
- **Tested with simulated data** (headless browser, realistic scenarios), not against the live service in the build environment. If something breaks, please open an issue with the log lines.

## Not supported

- **ResearchGate**: no public API, and its terms forbid scraping. Use it to discover names, then add them to the watchlist.
- **DBLP**: tried and removed, because browser requests to it kept failing.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole tool (HTML, CSS and JavaScript in one file) |
| `README.md` | This file |
| `LICENSE.txt` | MIT license |
| `docs/` | Tutorial screenshots, demo GIF and video, and `capture.py` that regenerates them (uses simulated data) |

## Contributing

It is plain HTML and JavaScript with no dependencies. Open `index.html` in a browser to develop. Pull requests are welcome, especially more field presets and better keyword suggestions.
## License
MIT. See [LICENSE](LICENSE.txt).
