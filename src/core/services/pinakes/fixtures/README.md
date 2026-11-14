# Pinakes response fixtures

Captured from a Pinakes instance (`api_shape` 2) on 2026-11-04. Each file is the response body exactly as
served (`curl -sS -o <file> '<url>'`), unmodified and unformatted, except the `*.enriched.json`
files, which are not captures (see _Enriched fixtures_ below); `.prettierignore` keeps
Prettier off them. They are typed against `../pinakes.types.ts` in `../pinakes.test.ts`, so a
schema drift in a re-capture fails the typecheck.

| File                            | HTTP | Request (`GET`, on the origin above)                                                                                                                | What it is                                  |
| ------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `by-uri.video.json`             | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ`                                                                  | `VideoObject`, status `ok`                  |
| `by-uri.article.json`           | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FBitcoin`                                                                          | `Article`, status `ok`                      |
| `by-uri.place.json`             | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fwww.openstreetmap.org%2Fnode%2F240109189`                                                                   | `City`, status `ok`                         |
| `by-uri.event.json`             | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fluma.com%2F376whqyw`                                                                                        | `Event`, status `ok`                        |
| `by-uri.book.json`              | 200  | `/v1/resources/by-uri?uri=isbn%3A9780140328721`                                                                                                     | `Book`, status `ok`                         |
| `by-uri.scholarly-article.json` | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fdoi.org%2F10.1038%2Fnature12373`                                                                            | `ScholarlyArticle`, status `ok`             |
| `by-uri.nature-article.json`    | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fwww.nature.com%2Farticles%2Fnature12373`                                                                    | `ScholarlyArticle`, status `ok`             |
| `by-uri.podcast.json`           | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fpodcasts.apple.com%2Fus%2Fpodcast%2Fdan-carlins-hardcore-history%2Fid173001861`                             | `PodcastSeries`, status `ok`                |
| `by-uri.movie.json`             | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fletterboxd.com%2Ffilm%2Fthe-matrix%2F`                                                                      | `Movie`, status `ok`                        |
| `by-uri.music-recording.json`   | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F1YQWosTIljIvxAgHWTp7KP`                                                          | `MusicRecording`, status `ok`               |
| `by-uri.pubky.json`             | 200  | `/v1/resources/by-uri?uri=pubky%3A%2F%2Fyjn8k7ww4sc4hskkmbcsep6b1xje8g4f8j3azpdqnwhhqckt7kso%2Fpub%2Floopky%2Fdecks%2Fp2uuj5jo5ln2%2Fmanifest.json` | `LearningResource`, status `ok`             |
| `by-uri.mb-release-group.json`  | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fmusicbrainz.org%2Frelease-group%2F8e8a594f-2175-38c7-a871-abb68ec363e7`                                     | `MusicAlbum` (Kind of Blue), status `ok`    |
| `by-uri.mb-artist-sparse.json`  | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fmusicbrainz.org%2Fartist%2Fb5416a54-4941-4fcf-b2a0-7f98da6f9344`                                            | `Person` (Sefa), no description or image    |
| `by-uri.mb-recording.json`      | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fmusicbrainz.org%2Frecording%2Fb1a9c0e9-d987-4042-ae91-78d6a3267d69`                                         | `MusicRecording` (Bohemian Rhapsody)        |
| `by-uri.mb-group.json`          | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fmusicbrainz.org%2Fartist%2F056e4f3e-d505-4dad-8ec1-d04f521cbb56`                                            | `MusicGroup` (Daft Punk)                    |
| `by-uri.missing.json`           | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fmusic.apple.com%2Fsong%2F1440717826`                                                                        | `WebPage`, status `missing`                 |
| `by-uri.unreachable.json`       | 200  | `/v1/resources/by-uri?uri=https%3A%2F%2Fwww.binance.com%2F`                                                                                         | `WebPage`, status `unreachable`             |
| `by-uri.not-found.json`         | 404  | `/v1/resources/by-uri?uri=https%3A%2F%2Fexample.com%2Fpinakes-does-not-know-this-link-1104`                                                         | unknown link: `{"error": "link not known"}` |
| `search.related.json`           | 200  | `/v1/search?related=0f3820de1c3532e8805674cc996978f9&limit=5`                                                                                       | 5 related cards of the video                |
| `search.related.because.json`   | 200  | `/v1/search?related=<id>`                                                                                                                           | 2 related cards, each with `because`        |
| `group.video.json`              | 200  | `/v1/groups/02fb8d65ac72842c9ddf06efdbcbf73b`                                                                                                       | group of 8 (`type` MusicRecording)          |
| `search.type-facet.json`        | 200  | `/v1/search?facet=type&limit=1`                                                                                                                     | 68 card types with `type_path`              |

`isbn:9780140328721` is a typed card whose `uri` is not a web link. `by-uri.nature-article` is the
same paper as `by-uri.scholarly-article`, read by its publisher's link: its `also_on` names the
`doi:` identifier by its service (`"site": "DOI"`). `by-uri.pubky` is a Loopky deck
(found with `/v1/search?sort=recent&limit=500`): a `pubky://` card whose `image` is `pubky://` too
and whose `open_in` names the client that opens it. `by-uri.missing` (the object
is gone upstream) and `by-uri.unreachable` were found with `/v1/search?sort=recent&limit=500`.

The four `by-uri.mb-*.json` captures are MusicBrainz cards, captured the same way. The recording
is _Bohemian Rhapsody_ (found with `/v1/search?type=MusicRecording&limit=200`).

## Enriched fixtures (`*.enriched.json`): not captured

Pinakes sends no `credits` yet. Each `by-uri.mb-<name>.enriched.json` is the capture
`by-uri.mb-<name>.json` above with only `description`, `image` and `credits` set, as the Pinakes
`Card.credits` contract defines them (`field`, `provider`, `source_url`, `author`, `license`,
`license_url`, `lang`, `excerpted`, `modified`, `subject`). Every other field is the captured value
(`pinakes.test.ts` checks it). The values come from the English Wikipedia REST summary (its
`extract`), Wikidata `P18`, the Commons file's `extmetadata` (artist, license) and MusicBrainz
(the recording's work). Replace them with real captures once Pinakes serves credits.

| File                                    | Fields added                                                                                                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `by-uri.mb-release-group.enriched.json` | `description` (Wikipedia _Kind of Blue_, replaces the capture's "Miles Davis"); `credits`: one `description` credit (wikipedia, CC-BY-SA-4.0, `en`, excerpted). `image` stays `null`: Wikidata has no `P18` for the album.          |
| `by-uri.mb-artist-sparse.enriched.json` | `credits: []` only: nothing found, a sparse card.                                                                                                                                                                                   |
| `by-uri.mb-recording.enriched.json`     | `description` (Wikipedia _Bohemian Rhapsody_, the work's article) with `subject` = the MusicBrainz work `41c94a08-a551-3c86-bb17-d9a52e3a618b`; `image` (Commons, US vinyl label, author Queen, `public-domain`, no `license_url`). |
| `by-uri.mb-group.enriched.json`         | `description` (Wikipedia _Daft Punk_); `image` (Commons _Daft Punk in 2013.jpg_, author Sony Music Entertainment, CC-BY-4.0).                                                                                                       |

To re-capture, run the same requests against a Pinakes instance and update the date above; do not
edit the bodies by hand.

## Meetup series fixtures (`*meetup*.json`): captured 2026-11-14, two trimmed

Captured from the candidate Pinakes (the preview's) for one Meetup series, a date page per date
joined with the organiser's iCal feed. `by-uri.meetup-date.json` (`/v1/resources/by-uri?uri=…/events/316908442/`:
the Dec 9 page, its token link the `uri`, its number link an alias), `by-uri.meetup-date-jan6.json`
(the Jan 6 page, the same way) and `by-uri.meetup-feed.json` (the feed, `DataFeed`) are as served.
`group.meetup-date.json` (`/v1/groups/73214ce6c99037f938ec3f80773de156`: the page and the feed's
date of it) and `occurrences.meetup.json` (`/v1/resources/51ee469240e25fe6a378dc8d317e3f89/occurrences`)
are trimmed: each card's `description` (the same long text on every date) is left out, nothing else.
