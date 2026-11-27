// Serves the Pubky App offline bundle on http://127.0.0.1:<port>, like serve.py and serve.mjs, from the
// `app` folder and `routes.json` next to the executable. Usage: pubky-app [--port N] [--no-browser]
package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

type routeTable struct {
	Port        int         `json:"port"`
	Placeholder string      `json:"placeholder"`
	Dynamic     []string    `json:"dynamic"`
	Redirects   [][2]string `json:"redirects"`
	NotFound    []string    `json:"notFound"`
}

type rewrite struct {
	pattern     *regexp.Regexp
	replacement string
}

var types = map[string]string{
	".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
	// React Server Component payloads; the client router accepts them as text/plain.
	".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".wasm": "application/wasm", ".svg": "image/svg+xml",
	".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
	".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".mp4": "video/mp4",
	".webm": "video/webm",
}

func fail(message string) {
	fmt.Println(message)
	// A double-clicked launcher's window would close before anyone could read the message.
	fmt.Println("Press Enter to close.")
	bufio.NewReader(os.Stdin).ReadString('\n')
	os.Exit(1)
}

func main() {
	exe, err := os.Executable()
	if err != nil {
		fail(err.Error())
	}
	root := filepath.Dir(exe)
	app := filepath.Join(root, "app")
	raw, err := os.ReadFile(filepath.Join(root, "routes.json"))
	if err != nil {
		fail("routes.json is missing next to the launcher. Keep the bundle's files together.")
	}
	var routes routeTable
	if err := json.Unmarshal(raw, &routes); err != nil {
		fail("routes.json is not valid: " + err.Error())
	}
	port := flag.Int("port", routes.Port, "port on 127.0.0.1")
	noBrowser := flag.Bool("no-browser", false, "do not open the browser")
	flag.Parse()

	var dynamic, redirects []rewrite
	for _, route := range routes.Dynamic {
		// `*` is one path segment; it stops at a dot so `/post/a/b.txt` keeps its `.txt`.
		expr := "^" + strings.ReplaceAll(regexp.QuoteMeta(route), `\*`, `[^/.]+`) + `($|[/.])`
		dynamic = append(dynamic, rewrite{regexp.MustCompile(expr), strings.ReplaceAll(route, "*", routes.Placeholder) + "$1"})
	}
	for _, pair := range routes.Redirects {
		expr := "^" + strings.ReplaceAll(regexp.QuoteMeta(pair[0]), `\*`, `([^/]+)`) + "$"
		redirects = append(redirects, rewrite{regexp.MustCompile(expr), pair[1]})
	}

	findFile := func(path string) string {
		base := filepath.Join(app, filepath.FromSlash(path))
		if base != app && !strings.HasPrefix(base, app+string(filepath.Separator)) {
			return ""
		}
		for _, candidate := range []string{base, base + ".html", filepath.Join(base, "index.html")} {
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				return candidate
			}
		}
		return ""
	}

	resolve := func(path string) (int, string) {
		for _, prefix := range routes.NotFound {
			if strings.HasPrefix(path, prefix) {
				return 404, ""
			}
		}
		for _, r := range redirects {
			if match := r.pattern.FindStringSubmatch(path); match != nil {
				target := r.replacement
				for _, value := range match[1:] {
					target = strings.Replace(target, "*", value, 1)
				}
				return 308, target
			}
		}
		if found := findFile(path); found != "" {
			return 200, found
		}
		// Every id of a dynamic route is served the one page the export holds for it, and so are its
		// payload files (`/post/a/b.txt`, `/post/a/b/__next...txt`); the app reads the ids from the URL.
		for _, r := range dynamic {
			if r.pattern.MatchString(path) {
				if found := findFile(r.pattern.ReplaceAllString(path, r.replacement)); found != "" {
					return 200, found
				}
			}
		}
		return 404, ""
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodGet && req.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		status, target := resolve(req.URL.Path)
		if status == 308 {
			w.Header().Set("Location", target)
			w.WriteHeader(308)
			return
		}
		if status == 404 {
			target = findFile("/404")
			if target == "" {
				w.WriteHeader(404)
				return
			}
		}
		data, err := os.ReadFile(target)
		if err != nil {
			w.WriteHeader(500)
			return
		}
		ext := strings.ToLower(filepath.Ext(target))
		contentType, ok := types[ext]
		if !ok {
			contentType = mime.TypeByExtension(ext)
		}
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		w.Header().Set("Content-Type", contentType)
		if status == 200 && strings.HasPrefix(req.URL.Path, "/_next/static/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		w.WriteHeader(status)
		if req.Method == http.MethodGet {
			w.Write(data)
		}
	})

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		// Another port is another origin, which would hide the session and the local index.
		fail(fmt.Sprintf("Port %d is busy. Close the program using it (or another copy of Pubky App) and try again.", *port))
	}
	url := fmt.Sprintf("http://127.0.0.1:%d/", *port)
	fmt.Printf("Pubky App is running at %s  (close this window or press Ctrl+C to stop)\n", url)
	if !*noBrowser {
		openBrowser(url)
	}
	if err := http.Serve(listener, handler); err != nil {
		fail(err.Error())
	}
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
