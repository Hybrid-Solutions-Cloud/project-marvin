# Platform support

_Status: published maturity contract · Tracking: AB#7741_

Project Marvin is designed as one application distributed through a versioned Linux Open Container Initiative (OCI) image. Docker, Azure, Cloudflare, and future cloud integrations are deployment adapters around that same application; they are not separate Project Marvin implementations.

No hosted target has reached **Supported** status in the current public baseline. The labels below distinguish repeatable evidence from architectural intent.

## Maturity labels

| Label | Meaning | Required evidence |
| --- | --- | --- |
| **Supported** | Maintained installation path suitable for normal operator use | Public conformance, persistence, security, backup, update, rollback, and recovery checks pass; instructions are current |
| **Tested** | A bounded behavior passes repeatable public automation | The named checks pass, but the complete support contract has not been met |
| **Experimental** | An implementation exists for evaluation | Core behavior works, but one or more support gates remain incomplete |
| **Planned** | Accepted roadmap direction | No usable or maintained installation is promised, and no delivery date is implied |

An architecture diagram, Dockerfile, deployment plan, or private installation is not sufficient evidence for **Supported** status.

## Current matrix

| Target | Current maturity | Public evidence | Missing before promotion | Tracking |
| --- | --- | --- | --- | --- |
| Local source workflow on Windows | **Tested** | [`npm run marvin:verify-local`](/status) runs in the Windows continuous-integration job | Remove remaining Windows-only assumptions and pass the same applicable checks on Ubuntu and macOS | AB#7738 |
| Raw `linux/amd64` OCI image | **Experimental** | [`Dockerfile.marvin`](https://github.com/Hybrid-Solutions-Cloud/project-marvin/blob/main/Dockerfile.marvin) defines the hosted image; Azure plan tests exercise its deployment contract | Publish immutable versioned images and pass restart, persistence, health, security, update, and rollback conformance | AB#7735, AB#7736 |
| Docker Compose on Linux Docker Engine | **Planned** | Portable runtime and Compose work is accepted into the roadmap | Implement the reference definition and prove durable state, health, backup, update, rollback, and removal | AB#7737 |
| Docker Desktop on Windows or macOS | **Planned** | Both hosts are included in the portability roadmap | Complete the Compose path and host-specific verification without requiring Windows containers | AB#7737, AB#7738 |
| Azure Container Apps | **Experimental** | [Azure reference adapter](/solutions/marvin-azure) plus automated deployment-plan and Bicep checks | Consume a versioned release image and publish repeatable conformance, recovery, update, and rollback evidence without private deployment data | AB#7735, AB#7736 |
| Cloudflare Containers | **Planned** | A bounded prototype is accepted into the roadmap | Build the adapter; prove persistent state outside ephemeral disk, scheduled execution, single-workspace locking, callbacks, security, update, rollback, and conformance | AB#7739, AB#7740 |
| Additional OCI schedulers, including Kubernetes, Amazon Web Services, and Google Cloud | **Planned** | The provider-neutral OCI contract reserves deployment-adapter boundaries | Create and verify a target-specific adapter before making any availability claim | AB#7736 |

Cloudflare becomes **Experimental** only when a usable prototype exists. It cannot become **Supported** until every listed persistence, scheduling, security, update, rollback, and conformance gate passes.

## Portable runtime contract

Every hosted adapter must supply the same minimum runtime contract:

- one released Project Marvin OCI image rather than a provider-specific application fork;
- HTTPS ingress and one authoritative public origin for sign-in, callbacks, and webhooks;
- secret injection without baking credentials into the image or repository;
- durable protected state that survives image and host replacement;
- one logical writable synchronization worker per workspace;
- liveness, readiness, structured logs, backup, update, migration, and rollback behavior; and
- outbound HTTPS access to the authorized calendar providers.

The current file-backed runtime requires a durable filesystem and one active replica. Platforms with ephemeral disks or request-driven lifecycles need a storage and scheduling adapter before they can run Project Marvin safely.

## Promotion rules

A target moves between maturity labels only when public evidence changes:

1. **Planned → Experimental:** a documented adapter can deploy the released image and complete a bounded smoke test.
2. **Experimental → Tested:** repeatable public automation proves the named behaviors.
3. **Tested or Experimental → Supported:** the complete conformance, operations, security, backup, update, rollback, and recovery contract passes.
4. **Any label → lower maturity:** required evidence becomes stale, skipped, or fails.

See the [roadmap](/roadmap), [release status](/releases), and [current product evidence](/status) for the work that changes these labels.

## Public and private evidence

The public matrix contains only repeatable repository evidence. Personal domains, tenant and subscription identifiers, email addresses, resource names, credentials, and private acceptance results must remain outside this repository. A private deployment can validate its own environment, but that evidence does not automatically promote the open-source product's support status.
