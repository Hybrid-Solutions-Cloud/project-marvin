# Cloudflare Evaluation

Cloudflare Containers are interesting, but they are not the first Keeper deployment target for Project Marvin.

## Short answer

Do not use Cloudflare as the primary Keeper runtime right now.

## Why not

Keeper is a stateful calendar sync service that is easiest to reason about as:

- one hosted container
- one mounted persistent data path
- one predictable public URL
- one always-on runtime

Cloudflare Containers currently use a Worker plus Durable Object plus container lifecycle model.
That is powerful, but it is a different architecture than simply running a long-lived sync web service with persistent mounted state.

For Project Marvin, that means Cloudflare would require adaptation work, not just deployment work.

## The main mismatch

Cloudflare Containers are designed around Worker-routed container instances and explicit lifecycle management.
Cloudflare documents container start, routing, and sleep behavior through the Worker and Durable Object model.

That is not a clean drop-in match for Keeper's current standalone deployment shape.

## What would be required

To make Keeper truly Cloudflare-native, the repo would likely need:

- a Worker front door
- a Durable Object coordination layer
- explicit container instance lifecycle logic
- a state model adapted away from the current mounted PostgreSQL data directory assumption
- a supported way to preserve Keeper state and background scheduling semantics across container sleep and restart behavior

That is a product adaptation project, not a simple deployment script.

## Recommendation

For now:

- use Azure Container Apps for hosted Keeper
- keep Cloudflare as a future research path
- do not advertise Cloudflare as production-ready in Project Marvin yet

## References

- [Cloudflare Containers getting started](https://developers.cloudflare.com/containers/get-started/)
- [Cloudflare Container interface](https://developers.cloudflare.com/containers/container-class/)
- [Cloudflare container lifecycle](https://developers.cloudflare.com/containers/platform-details/architecture/)
- [Cloudflare scaling and routing](https://developers.cloudflare.com/containers/platform-details/scaling-and-routing/)
- [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/pricing/)
- [Cloudflare Durable Objects overview](https://developers.cloudflare.com/durable-objects/)
