```sh
yarn add zeromq
yarn add -D electron-rebuild
yarn electron --version
./node_modules/.bin/electron-rebuild -w zeromq --version 22.1.0 # Rebuild zmq for electron

cd node_modules/electron/dist
ln -s ../../zeromq/prebuilds .
```

`webpack.main.config.ts` add the following:

```js
node: {
  _dirname: true;
}
```
