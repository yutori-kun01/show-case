// sample-owner が作った小さなTodoサーバー。
const http = require("http");

const todos = [];

http
  .createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(todos));
  })
  .listen(process.env.PORT || 3000);
