# Changelog

All notable changes of `multi-tour-commercial-reservation-portal` (Commercial and Reservations portal) are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [3.1.0] - 2026-11-18

Minor release after 3.0.0. Every entry below is a pull request merged into `develop`, promoted to `qa` with `git cherry-pick -x` and re-applied to `release/3.1.0` the same way; the entry is the title of the original pull request without its type. The frozen head of `qa` is `6284a7fc54823eb7df6f56626da2b0703de6f6ca`.

### Changed

#### HU-COM-016 - Refunds: credit balance refund requests

- Stop saying the credit balance refund is authorized on its own after 24 hours ([PR 310](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/310), promoted by [PR 311](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/311))

#### Cross-cutting: documentation alignment (no single story is named in the pull request)

- Align the readme with the connected adapters and blob urls ([PR 309](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/309), promoted by [PR 311](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/311))

## [3.0.0] - 2026-11-14

Cut 3 release. Every entry below is a pull request merged into `qa` and re-applied to `release/3.0.0` with `git cherry-pick -x`; the heading of each group is the user story named in the pull request, and the entry is the title of the pull request without its type. The frozen head of `qa` is `08af8910f2275e74e855a68fab7ac580fcf9fcba`.

### Added

#### HU-COM-002 - Manage associated establishments

- The contact, reason and bitacora of establishments ([PR 285](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/285))

#### HU-COM-010 - Validate or reject a payment proof

- The approval of a payment proof through the saga ([PR 292](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/292))

#### HU-COM-013 - Cancel a reservation at the customer's request

- The cancellation penalty policy ([PR 301](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/301))

#### HU-COM-016 - Authorize and execute a refund

- The origin and rules panels of the manage refund screen ([PR 298](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/298))
- Listing and deciding credit balance refund requests ([PR 300](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/300))

### Changed

#### HU-COM-001 - Manage the operational catalog

- The catalog forms and the new service transport ([PR 137](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/137))
- The HU-COM-001 test names ([PR 160](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/160))
- The size budget, the shared money and the README ([PR 217](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/217))
- The calendar independent demo dates and the overdue count of the review panel ([PR 228](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/228))

#### HU-COM-002 - Manage associated establishments

- The associated establishments management ([PR 139](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/139))

#### HU-COM-003 - Manage discount rules

- The reactivation and the pillar fixes of the discount rules ([PR 142](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/142))
- The HTTP adapter of the discount rules ([PR 161](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/161))

#### HU-COM-004 - View and apply current discounts

- The entrances to Aplicar descuento of hu-com-004 ([PR 146](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/146))
- The Aplicar descuento screen of hu-com-004 ([PR 147](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/147))
- The detail, the reasons and the pillar fixes of hu-com-004 ([PR 148](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/148))
- Remove stale HU-COM-004 TODO comments ([PR 307](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/307))

#### HU-COM-005 - Register the lead customer and companions

- The risk notice and the refusal focus of the customers form ([PR 150](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/150))
- The risk block of the reservation form ([PR 152](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/152))
- The customers HTTP adapter and the titular link by e-mail ([PR 163](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/163))
- The companions of the customer screens 21 and 25 ([PR 223](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/223))

#### HU-COM-006 - Browse the offer from the digital channel

- The public offer, the departures and the quote over the contract ([PR 220](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/220))

#### HU-COM-007 - Create a reservation and calculate its value

- The reservation texts moved into reservations-copy ([PR 185](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/185))
- The self-service and shell texts moved into copy files ([PR 187](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/187))
- The operator look fixes of the reservation detail, the tables and the tour selector ([PR 219](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/219))
- The reservations, the additional discount, the holder and the risk data over the contract ([PR 221](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/221))
- The customer search by name of the reservation form ([PR 253](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/253))

#### HU-COM-008 - Reserve from the digital channel

- The payment type and method, the visitor departures and the contract refusals ([PR 224](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/224))
- The holder, the risk data per traveler and the discount rule edit ([PR 225](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/225))
- The second mode of Continuar pago, the cash notice and the payment deadline ([PR 226](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/226))
- The full departure listed as Salida llena in the reservation form ([PR 229](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/229))

#### HU-COM-009 - Register a payment or a partial payment

- The payment parameters port ([PR 188](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/188))
- The Parametros de pago screen and the minimum deposit of screen 13 ([PR 218](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/218))
- The self-service, payments, proof panel and payment parameters over the contract ([PR 222](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/222))
- The minimum deposit as a notice of the payment screen ([PR 254](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/254))

#### HU-COM-010 - Validate or reject a payment proof

- The proof file view, the decision reason notice and the Spanish payment refusals ([PR 227](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/227))
- The proof panel without reads per row and the demo excess ([PR 255](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/255))
- The source tree and foundation test fixes ([PR 299](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/299))

#### HU-COM-011 - Manage the reservations pending payment

- The phone of the customer in the follow-up screen ([PR 262](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/262))
- The follow-up over the routes of the api ([PR 264](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/264))
- The frozen deadline and the line endings of the follow-up page ([PR 267](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/267))

#### HU-COM-012 - Modify a reservation before execution

- The modification quote and writer over the service ([PR 265](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/265))
- The modification panel and its history ([PR 268](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/268))

#### HU-COM-013 - Cancel a reservation at the customer's request

- The cancellation quote and writer over the service ([PR 258](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/258))

#### HU-COM-014 - Consult my reservations and my supports

- Mis pagos over the service and its next action ([PR 261](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/261))

#### HU-COM-016 - Authorize and execute a refund

- The refunds over the service and the execute-refund saga ([PR 260](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/260))
- The refund acceptance criteria tests ([PR 293](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/293))

#### HU-COM-017 - Record and apply a credit balance

- The Saldo a favor header action of Pagos ([PR 259](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/259))
- The credit balance over the container client ([PR 263](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/263))
- The customer request of the credit balance refund ([PR 278](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/278))
- The checkout credit application and the operator refund request ([PR 281](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/281))

#### HU-COM-018 - Reschedule an affected reservation

- The episode of every Reprogramar of the demo ([PR 266](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/266))
- The reschedulings reads and writes over the service ([PR 269](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/269))
- The episodes list of the operator ([PR 270](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/270))
- The external answer and the episode history ([PR 271](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/271))
- The line endings of the reservation model ([PR 272](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/272))
- The entries of the rescheduling episode ([PR 273](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/273))
- The notification and instants of the deadline on 24A ([PR 274](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/274))
- The shared error state helper of a failed read ([PR 275](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/275))

#### HU-COM-020 - Handle the obligations of an inactive tenant

- The restricted menu of an inactive tenant ([PR 256](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/256))

#### Cross-cutting: CI, test fixes and alignment promotions (no single story is named in the PR title, branch or body)

- The second batch of domain 02 ([PR 107](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/107))
- Share the not-in-contract helper from api-paths ([PR 165](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/165))
- The fictitious administrator name of the demo data ([PR 257](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/257))
- Align four files of qa with develop ([PR 276](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/276))
- The checks on pull requests to main ([PR 303](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/303))
- Run the test workflow only on pull requests to develop and qa ([PR 306](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/306))

### Fixed

#### HU-COM-016 - Authorize and execute a refund

- The refund panel texts of the mockup v1.9 ([PR 294](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/294))

#### Cross-cutting: CI, test fixes and alignment promotions (no single story is named in the PR title, branch or body)

- The bundle budget of the module build ([PR 283](https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/pull/283))

[Unreleased]: https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/compare/v3.1.0...HEAD
[3.1.0]: https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/code-corhuila/multi-tour-commercial-reservation-portal/releases/tag/v3.0.0
