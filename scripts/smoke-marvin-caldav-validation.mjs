import assert from "node:assert/strict";
import http from "node:http";
import { validateCalDavCredentials } from "../solutions/marvin-engine/src/util/caldav-connection.mjs";

const requests = [];
const server = http.createServer((req, res) => {
  requests.push({ method: req.method, auth: req.headers.authorization || "" });
  if (req.headers.authorization === `Basic ${Buffer.from("user@example.com:app-password", "utf8").toString("base64")}`) {
    res.writeHead(207, { "Content-Type": "application/xml" });
    res.end("<multistatus xmlns=\"DAV:\"></multistatus>");
    return;
  }
  res.writeHead(401, { "Content-Type": "text/plain" });
  res.end("Unauthorized");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const serverUrl = `http://127.0.0.1:${address.port}/dav/principal/`;

const okResult = await validateCalDavCredentials({
  serverUrl,
  username: "user@example.com",
  password: "app-password"
});
assert.equal(okResult.ok, true);
assert.equal(okResult.status, "connected");
assert.equal(okResult.httpStatus, 207);

const badResult = await validateCalDavCredentials({
  serverUrl,
  username: "user@example.com",
  password: "wrong-password"
});
assert.equal(badResult.ok, false);
assert.equal(badResult.status, "invalid");
assert.equal(badResult.httpStatus, 401);

server.close();

console.log(JSON.stringify({
  ok: true,
  requests,
  successStatus: okResult.httpStatus,
  failureStatus: badResult.httpStatus
}, null, 2));
