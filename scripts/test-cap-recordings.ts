import assert from "node:assert/strict";
import { validateRecording, capServerUrl } from "../lib/cap-recordings";
assert.equal(validateRecording({title:" Revisión ", url:"https://cap.so/s/abc"}).title, "Revisión");
for (const url of ["javascript:alert(1)", "http://cap.so/s/a", "https://cap.so.evil.test/s/a", "https://user:pass@cap.so/s/a", "https://evil.test/a", "https://cap.so/"]) {
  assert.throws(() => validateRecording({title:"Test",url}));
}
assert.throws(() => validateRecording({title:" ",url:"https://cap.so/s/a"}));
assert.throws(() => validateRecording({title:"Test",url:"https://cap.so/s/a",notes:"a".repeat(5001)}));
process.env.CAP_SERVER_URL = "https://recordings.example.test";
assert.equal(capServerUrl(), "https://recordings.example.test");
assert.equal(validateRecording({title:"Test",url:"https://recordings.example.test/s/a"}).url, "https://recordings.example.test/s/a");
process.env.CAP_SERVER_URL = "javascript:alert(1)";
assert.equal(capServerUrl(), null);
console.log("Cap recording URL validation passed");
