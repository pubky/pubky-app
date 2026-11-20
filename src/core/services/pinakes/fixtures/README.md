# Pinakes response fixtures

Captured from a Pinakes instance (`api_shape` 2) on 2026-11-04. Each file is the response body exactly as
served (`curl -sS -o <file> '<url>'`), unmodified and unformatted; `.prettierignore` keeps
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

To re-capture, run the same requests against a Pinakes instance and update the date above; do not
edit the bodies by hand.
