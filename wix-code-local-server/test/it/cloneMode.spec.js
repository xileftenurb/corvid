const {
  editor: loadEditor,
  editorSiteBuilder
} = require("@wix/fake-local-mode-editor");
const { localSiteBuilder } = require("@wix/wix-code-local-site/testkit");
const { siteCreators: sc } = require("@wix/wix-code-local-test-utils");
const localServer = require("../../src/server");
const { initLocalSite, readLocalSite } = require("../utils/localSiteDir");

describe("clone mode", () => {
  it("should not start the server in clone mode if the site directory is not empty", async () => {
    const localSiteFiles = localSiteBuilder.buildFull(sc.publicCode());

    const localSitePath = await initLocalSite(localSiteFiles);

    const server = localServer.startInCloneMode(localSitePath);

    await expect(server).rejects.toThrow("CAN_NOT_CLONE_NON_EMPTY_SITE");
  });

  // TODO: should not start the server in clone mode if the site directory does not exist ?

  it("should save localy the editor's document on load", async () => {
    const siteItems = [
      sc.page(),
      sc.lightbox(),
      sc.styles(),
      sc.site(),
      sc.router()
    ];

    const editorSite = editorSiteBuilder.buildFull(...siteItems);

    const expectedLocalSite = localSiteBuilder.buildFull(...siteItems);

    const localSitePath = await initLocalSite();
    const server = await localServer.startInCloneMode(localSitePath);
    const editor = await loadEditor(server.port, editorSite);
    const localSiteFiles = await readLocalSite(localSitePath);

    expect(localSiteFiles).toEqual(expectedLocalSite);

    await editor.close();
    await server.close();
  });

  it("should save code files on load", async () => {
    const siteItems = [sc.publicCode(), sc.backendCode()];

    const localSitePath = await initLocalSite();
    const server = await localServer.startInCloneMode(localSitePath);

    const editorSite = editorSiteBuilder.buildFull(...siteItems);
    const expectedLocalSite = localSiteBuilder.buildPartial(...siteItems);

    const editor = await loadEditor(server.port, editorSite);
    const serverFiles = await readLocalSite(localSitePath);

    expect(serverFiles).toMatchObject(expectedLocalSite);

    await editor.close();
    await server.close();
  });

  it("should save page code files localy on load", async () => {
    const pageWithCode = sc.pageWithCode();

    const localSitePath = await initLocalSite();
    const server = await localServer.startInCloneMode(localSitePath);

    const editorSite = editorSiteBuilder.buildFull(pageWithCode);
    const expectedLocalSite = localSiteBuilder.buildPartial(pageWithCode);

    const editor = await loadEditor(server.port, editorSite);
    const serverFiles = await readLocalSite(localSitePath);

    expect(serverFiles).toMatchObject(expectedLocalSite);

    await editor.close();
    await server.close();
  });

  it("should save lightbox code files localy on load", async () => {
    const lightboxWithCode = sc.lightboxWithCode();

    const localSitePath = await initLocalSite();
    const server = await localServer.startInCloneMode(localSitePath);

    const editorSite = editorSiteBuilder.buildFull(lightboxWithCode);
    const expectedLocalSite = localSiteBuilder.buildPartial(lightboxWithCode);

    const editor = await loadEditor(server.port, editorSite);
    const serverFiles = await readLocalSite(localSitePath);

    expect(serverFiles).toMatchObject(expectedLocalSite);

    await editor.close();
    await server.close();
  });
});
