## [1.4.0](https://github.com/moontaiworks/fanbox-dl/compare/v1.3.5...v1.4.0) (2026-07-02)

### Features

* add Dockerfile ([e3c1655](https://github.com/moontaiworks/fanbox-dl/commit/e3c1655dd1d07deb1a8c548b22f878cbd34b02a6))

## [1.3.5](https://github.com/moontaiworks/fanbox-dl/compare/v1.3.4...v1.3.5) (2026-07-02)

### Bug Fixes

* honor limiters ([29997b3](https://github.com/moontaiworks/fanbox-dl/commit/29997b3879ee208f9c3cd9213e83d5c78dd45eb1))
* sanitize file and dir names ([a2bedc2](https://github.com/moontaiworks/fanbox-dl/commit/a2bedc21bb4ac20749b399b6bcd89d67061ac2db))

## [1.3.4](https://github.com/moontaiworks/fanbox-dl/compare/v1.3.3...v1.3.4) (2026-06-30)

### Bug Fixes

* prevent interaction on headers between requests ([57b59ee](https://github.com/moontaiworks/fanbox-dl/commit/57b59ee2938bdf46c8c6a17f2065b481a7dabb78))

## [1.3.3](https://github.com/moontaiworks/fanbox-dl/compare/v1.3.2...v1.3.3) (2026-06-30)

### Bug Fixes

* handle possible failure on fetch post content ([baec53f](https://github.com/moontaiworks/fanbox-dl/commit/baec53f6661e3d64246384b28859161c636b79f6))

## [1.3.2](https://github.com/moontaiworks/fanbox-dl/compare/v1.3.1...v1.3.2) (2026-06-30)

## [1.3.1](https://github.com/moontaiworks/fanbox-dl/compare/v1.3.0...v1.3.1) (2026-06-30)

### Bug Fixes

* resolve race condition on same manifest ([a1ae423](https://github.com/moontaiworks/fanbox-dl/commit/a1ae423ac64dd15f5a5bdd1aa55ac3a33ae1dfdc))

## [1.3.0](https://github.com/moontaiworks/fanbox-dl/compare/v1.2.2...v1.3.0) (2026-06-30)

### Features

* little speed up by not waiting for whole post done ([5380dad](https://github.com/moontaiworks/fanbox-dl/commit/5380dade1167e7b280e0daf3d840b927a52d1be1))
* skip download asset if exists ([94bd246](https://github.com/moontaiworks/fanbox-dl/commit/94bd246e6211b0bc8fc1c5eeea532e78ad7c4cc1))

## [1.2.2](https://github.com/moontaiworks/fanbox-dl/compare/v1.2.1...v1.2.2) (2026-06-30)

### Bug Fixes

* wrong markdown filepath ([a909fec](https://github.com/moontaiworks/fanbox-dl/commit/a909fecb253fef026f137ea9495d695671341cb9))

## [1.2.1](https://github.com/moontaiworks/fanbox-dl/compare/v1.2.0...v1.2.1) (2026-06-30)

### Bug Fixes

* pad file index to proper digits ([1dabdad](https://github.com/moontaiworks/fanbox-dl/commit/1dabdadb34a5600e3b628ad47c549397f098053a))

## [1.2.0](https://github.com/moontaiworks/fanbox-dl/compare/v1.1.0...v1.2.0) (2026-06-30)

### Features

* add more headers ([8b084a4](https://github.com/moontaiworks/fanbox-dl/commit/8b084a44b423adada7cc52d54496e985312cd86a))
* log for http transport ([bb2e365](https://github.com/moontaiworks/fanbox-dl/commit/bb2e365ab6accca5a9e3c066947a5fa8c4e50fb8))

### Bug Fixes

* add sub dir for creator ([b2dfcec](https://github.com/moontaiworks/fanbox-dl/commit/b2dfcec227c0d6a93d4e8b282cfafe4b02ad5193))
* ignore to using an os temp file ([b24c733](https://github.com/moontaiworks/fanbox-dl/commit/b24c733e51aa389215dafab858d5f91715813f9b))
* parse body if not json ([c5c989a](https://github.com/moontaiworks/fanbox-dl/commit/c5c989a4bf099f49ccde3679b7c49019d08df773))

## [1.1.0](https://github.com/moontaiworks/fanbox-dl/compare/v1.0.1...v1.1.0) (2026-06-30)

### Features

* add logs ([9f2f609](https://github.com/moontaiworks/fanbox-dl/commit/9f2f609e7fb54f91cd6bf2a6db394c1c845d832f))
* add path-manager ([ce45131](https://github.com/moontaiworks/fanbox-dl/commit/ce45131ed83e0241b4c255689ba2c3864a6fe90a))
* asset downloader ([8cc367a](https://github.com/moontaiworks/fanbox-dl/commit/8cc367a940064ed77217c73dd14ce791d647a2c8))
* connect asset download ([e40ad35](https://github.com/moontaiworks/fanbox-dl/commit/e40ad35b4dd2904e26a2e5cf618bf793683e6286))
* discover creator posts ([d8307ca](https://github.com/moontaiworks/fanbox-dl/commit/d8307cabb7a1e1b1e1bae4338c69f5f9398ad908))
* implement abstract sync logics ([0d42366](https://github.com/moontaiworks/fanbox-dl/commit/0d42366080d38576f5bc5fd3b2647628f57cb114))
* log resolved creator ids ([24f3746](https://github.com/moontaiworks/fanbox-dl/commit/24f374678b52e9e347e6c26beed6cabc4e5e69cd))
* post content transformer ([2fa14c3](https://github.com/moontaiworks/fanbox-dl/commit/2fa14c374f071b51984b57a6381d7adae3f09bac))
* provide a log feature but able to log different by level ([e9dfceb](https://github.com/moontaiworks/fanbox-dl/commit/e9dfcebb5998d20510d0d2b6fecafe6293874048))
* set default request interval to 500ms ([654bb90](https://github.com/moontaiworks/fanbox-dl/commit/654bb90aa468f58c53e64e225eebb15b3217966f))
* skip save if there are no any downloaded assets ([1c0761d](https://github.com/moontaiworks/fanbox-dl/commit/1c0761d11c5beb6f455323b49bbe36300192947f))
* sync a creator ([318f6a9](https://github.com/moontaiworks/fanbox-dl/commit/318f6a9677d35bad113a568f4d5baae6a17a2f7b))

### Bug Fixes

* adjust request init logic to prevent reuse same request object ([a3106a3](https://github.com/moontaiworks/fanbox-dl/commit/a3106a33a8db6e6e9aebb098d1e4cf90ddc780f4))
* generic type for json() response helper ([9c70499](https://github.com/moontaiworks/fanbox-dl/commit/9c70499aa11016d14359d7f8a3ebbeb916764739))
* guard command ([260cecb](https://github.com/moontaiworks/fanbox-dl/commit/260cecb3e59394c895edef6151d8d9eb261f71d0))
* remove obsolete cli options ([05c6c9e](https://github.com/moontaiworks/fanbox-dl/commit/05c6c9eef7ad9c4e43c41be3709a26314d9ef877))
* use pure implement for http header ([f001f37](https://github.com/moontaiworks/fanbox-dl/commit/f001f370723953f72c9df0700552df6d6e8f060d))

## [1.0.1](https://github.com/moontaiworks/fanbox-dl/compare/v1.0.0...v1.0.1) (2026-06-04)

### Bug Fixes

* correct following creators response structure ([fa93f8d](https://github.com/moontaiworks/fanbox-dl/commit/fa93f8d6e10c93a85b46807d8b0c3312e3829cd1))

## 1.0.0 (2026-06-04)

### Features

* add --flat-posts flag ([da93f00](https://github.com/moontaiworks/fanbox-dl/commit/da93f005aa9ff8af213f641269117167f61116eb))
* add cli help dry run and verbose logs ([79500af](https://github.com/moontaiworks/fanbox-dl/commit/79500afd82f1ca3f854616cc42c61ead32221fc7))
* add downloader primitives ([eeb88db](https://github.com/moontaiworks/fanbox-dl/commit/eeb88db2652cedf5f96c99c9dd68694f7f41e7e8))
* add native http2 transport ([60d0540](https://github.com/moontaiworks/fanbox-dl/commit/60d0540f7cd8ce985ee27f6dddb7431b27eaa542))
* add readonly fanbox sdk client ([755c2a6](https://github.com/moontaiworks/fanbox-dl/commit/755c2a6125c615dbcbe4ce613325c9d18e384418))
* expose fanbox download cli ([a937bba](https://github.com/moontaiworks/fanbox-dl/commit/a937bbad2a0777168bf929f82b58d4f7b0acd976))
* implement fanbox download workflow ([df14d98](https://github.com/moontaiworks/fanbox-dl/commit/df14d98eed96b31f68b26042edeab2f98d0f1a46))
* replace --verbose flag with --log-level option for improved logging control ([3976eca](https://github.com/moontaiworks/fanbox-dl/commit/3976eca5a2ae26189b67a417edf096f53c46b610))
* support creator post cursors ([733e58d](https://github.com/moontaiworks/fanbox-dl/commit/733e58d4089194d9d8625ce66bf7e8e48a7d7c8d))
* use random use-agent ([ef4d506](https://github.com/moontaiworks/fanbox-dl/commit/ef4d506d9ff96c0634254c445ceb47af0cc0bbe1))

### Bug Fixes

* attach headers in downloader ([3cddcb2](https://github.com/moontaiworks/fanbox-dl/commit/3cddcb2f2ebcbd12a4a4677635eb29f7fcaabd9e))
* debug log downloader response errors ([e07bd8a](https://github.com/moontaiworks/fanbox-dl/commit/e07bd8aca672c7bd5a7c7b3a0aee8b631f7b4423))
* export fanbox api error ([da6aa5c](https://github.com/moontaiworks/fanbox-dl/commit/da6aa5c5196172437eb54e9ad8aa507c1c2a8a33))
* flat and index contents in folder ([1c4dc83](https://github.com/moontaiworks/fanbox-dl/commit/1c4dc835d57e783ad229c6864de3e5dc68be2a14))
* load fanbox cookies from cookies txt ([b7f0a43](https://github.com/moontaiworks/fanbox-dl/commit/b7f0a43a374cfd8db1ed9069b5d7b2521b51c413))
* remove require command layer ([56b9dd4](https://github.com/moontaiworks/fanbox-dl/commit/56b9dd4751b89a9e0b0d147e8e9d924877b3a6ea))
* support fanbox browser session headers ([afba685](https://github.com/moontaiworks/fanbox-dl/commit/afba685d51e514da74ac4ac0fb207f4ccd4d88f9))

# Changelog

All notable changes to this project will be documented in this file.

This changelog is automatically generated by [semantic-release](https://github.com/semantic-release/semantic-release) based on [Conventional Commits](https://www.conventionalcommits.org/).
