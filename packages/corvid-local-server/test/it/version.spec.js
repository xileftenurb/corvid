const { socketClient } = require("corvid-local-test-utils");
const { localServer, closeAll } = require("../utils/autoClosing");
const { initLocalSite } = require("../utils/localSiteDir");
const {
  apiVersion,
  supportedSiteDocumentVersion
} = require("../../src/versions.json");

const { version: localServerModuleVersion } = require("../../package.json");

afterEach(closeAll);

const getEditorEndpoint = server => `http://localhost:${server.port}`;

const clientSocketOptions = {
  transportOptions: {
    polling: {
      extraHeaders: {
        origin: "https://editor.wix.com"
      }
    }
  }
};

describe("local server version", () => {
  it("should allow an editor to get the local server module version", async () => {
    const localSiteDir = await initLocalSite();
    const server = await localServer.startInCloneMode(localSiteDir);

    const editorSocket = await socketClient.connect(
      getEditorEndpoint(server),
      clientSocketOptions
    );

    const handshakeData = await socketClient.sendRequest(
      editorSocket,
      "HANDSHAKE"
    );

    expect(handshakeData).toEqual({
      serverVersion: localServerModuleVersion,
      apiVersion,
      supportedSiteDocumentVersion
    });
  });
});
