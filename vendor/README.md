# Portable Beignet dependency

The wallet installs `beignet-portable-engine-0.43.6.tgz` through its npm lockfile. The file name identifies the upstream engine version. The adapter package retains its own version, `0.1.0`. The running wallet engine reports `0.43.6-portable`.

The archive combines [Beignet v0.43.6](https://github.com/coreyphillips/beignet/releases/tag/v0.43.6) with the [portable adapters](https://github.com/coreyphillips/beignet-portable-engine/tree/c90f5f05a367c7192bcff704c16ef71ad57b3400). The rebuild script pins both source commits and applies the upstream changes to the portable source tree. The metadata patch records the source version and validation in the resulting checkout.

Run the following from the wallet repository with Node 24.22.1 and npm 11.19.1. The script creates a fresh temporary checkout, checks the engine declarations, runs the portable suite, and compares the final archive with the checked-in copy.

```sh
bash vendor/rebuild-portable.sh
```

The expected SHA-256 is `14292b27e6f4f9a21caa2fd16ab81fcb3865a549bd6b8b72d5bdd8539bf2f766`.
