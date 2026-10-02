import http.server


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()


http.server.HTTPServer(('127.0.0.1', 8765), H).serve_forever()
