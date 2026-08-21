# Security policy

## Supported version

Only the latest published alpha is supported.

## Report a vulnerability

Please use GitHub's private vulnerability-reporting feature rather than a public issue when
a report could expose players to harm.

## Trust boundary

RELAY//10 is static client-side software. It does not request accounts, camera, microphone,
location, contacts, notifications, or remote-code execution.

Relay fragments are untrusted player-controlled input. The decoder:

- enforces a character and encoded-size bound before decoding;
- validates envelope and payload structure;
- caps scalar ranges, chain length, and supported versions;
- rejects damaged checksums and malformed UTF-8/JSON.

The checksum is non-cryptographic corruption detection. Anyone can generate or modify a
valid relay. Do not use a baton as evidence of identity, score, sequence, or fair play.

The game uses no third-party runtime scripts. A deployment owner remains responsible for
HTTPS, response headers, platform configuration, and review of later changes.
