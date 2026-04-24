const http = require('http');

const programme = {
    id: "test-001",
    name: "Tuesday Track Session",
    blocks: [
        {
            name: "Track - Pyramid",
            segments: [Track - Pyramid
                { name: "Fast", duration: 15 },
                { name: "Easy", duration: 30 },
                { name: "Fast", duration: 15 },
                { name: "Easy", duration: 30 }
            ]
        },
        {
            name: "Hill Climbs",
            segments: [
                { name: "Up",   duration: 60 },
                { name: "Down", duration: 60 },
                { name: "Up",   duration: 60 },
                { name: "Down", duration: 60 },
                { name: "Up",   duration: 60 },
                { name: "Down", duration: 60 }
            ]
        }
    ]
};

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/programme/latest') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(programme));
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Leadout server running on port ${port}`);
});
