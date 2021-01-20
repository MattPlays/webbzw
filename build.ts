import {serve} from "https://deno.land/std@0.80.0/http/server.ts";

import {renderToString} from "https://deno.land/x/dejs@0.9.3/mod.ts";
import ws from "https://deno.land/x/deno_ws@0.1.4/mod.ts";

// const WASM_PATH = "./wasm/target/wasm32-unknown-unknown/release/wasm.wasm";

let template = "";
let css = "";
let js = "";

async function loadTemplate(){
  template = await Deno.readTextFile("./src/index.ejs");
}

async function loadCSS(){
  css = await Deno.readTextFile("./src/style.css");
}

async function loadJS(){
  const {diagnostics, files} = await Deno.emit("src/app.ts", JSON.parse(await Deno.readTextFile("tsconfig.json")));

  if(diagnostics.length > 0){
    console.log(diagnostics);
  }

  js = files["deno:///bundle.js"];
}

async function build(): Promise<string>{
  while(template === ""){
    console.log("a");
    await loadTemplate();
  }
  while(css === ""){
    console.log("b");
    await loadCSS();
  }
  while(js === ""){
    console.log("c");
    await loadJS();
  }

  return await renderToString(template, {
    css,
    js
  });
}

await loadTemplate();
await loadCSS();
await loadJS();

if(Deno.args[0] === "serve"){
  const WS_PORT = 8001;
  const RELOAD_COMMAND = "reload";
  const RELOAD_TIMEOUT = 50;

  const RELOAD_HTML = `<script>var ssgs=new WebSocket("ws://localhost:${WS_PORT}");ssgs.onmessage=function(event){if(event.data==="${RELOAD_COMMAND}"){window.location.reload()}}</script>`;

  const server = serve({port: 8000});
  console.log("dev server running on http://localhost:8000/");

  const wss = new ws.Server(undefined, WS_PORT);

  const _reload = async (event: Deno.FsEvent): Promise<void> => {
    if(event.paths[0].endsWith("index.ejs")){
      console.log("template changed");
      await loadTemplate();
    }else if(event.paths[0].endsWith("style.css")){
      console.log("css changed");
      await loadCSS();
    }else if(event.paths[0].endsWith(".ts")){
      console.log("js changed");
      await loadJS();
    }

    wss.clients.forEach((client) => client.send(RELOAD_COMMAND));
  };

  let timeoutId = 0;
  const reload = (event: Deno.FsEvent) => {
    if(timeoutId){
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => _reload(event), RELOAD_TIMEOUT);
  };

  setTimeout(async () => {
    for await(const event of Deno.watchFs("src", {recursive: true})){
      await reload(event);
    }
  });

  for await(const req of server){
    // if(req.url === "/wasm.wasm"){
    //   const headers = new Headers();
    //   headers.set("content-type", "application/wasm");

    //   req.respond({
    //     status: 200,
    //     headers,
    //     body: await Deno.readFile(WASM_PATH)
    //   });
    //   continue;
    // }

    try{
      req.respond({
        status: 200,
        body: await build() + RELOAD_HTML
      });
    }catch(err){
      req.respond({
        status: 500,
        body: `<!DOCTYPE html><html><body><pre>${err}</pre>${RELOAD_HTML}</body></html>`
      });
    }
  }
}else{
  try{
    await Deno.lstat("build");
  }catch(err){
    if(err instanceof Deno.errors.NotFound){
      await Deno.mkdir("build");
    }else{
      throw err;
    }
  }

  // await Deno.copyFile(WASM_PATH, "./build/wasm.wasm");

  await Deno.writeTextFile("build/index.html", await build());
}
