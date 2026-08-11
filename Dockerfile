# Stage 1  build the PipWorks OCaml engine (js_of_ocaml → pipworks_ocaml.js)
FROM ocaml/opam:debian-ocaml-5.2 AS engine

RUN opam install -y dune js_of_ocaml js_of_ocaml-ppx

COPY --chown=opam:opam ocaml/ /home/opam/engine/
WORKDIR /home/opam/engine
RUN opam exec -- dune build

# Stage 2  slim Node runtime (zero runtime npm dependencies, nothing to install)
FROM node:18-slim

WORKDIR /app

COPY package.json server.js pipworks.js presets.js ./
COPY public/ public/
COPY --from=engine /home/opam/engine/pipworks_ocaml.js ocaml/pipworks_ocaml.js

EXPOSE 3005

# node:18-slim ships no curl; use Node's global fetch
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3005)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
