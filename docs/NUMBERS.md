# Where the numbers come from

ArchSim is a teaching tool, not a capacity planner. These are the main assumptions, how each compares with public figures, and where to check them. Prices are AWS list prices in US and EU regions, checked in November 2026; other clouds and regions differ.

Each row is marked:

- **Matches**: the engine uses the published figure.
- **Simplified**: same shape as the published figure, with fewer steps or a rounder number.
- **Teaching value**: chosen so classic designs behave as expected, not taken from a price list. Treat these as relative, not absolute.

## Network

| Assumption | In ArchSim | Published figure | Status |
|---|---|---|---|
| Round trip per distance | about 1 ms per 100 km of great-circle distance, plus 2 ms | Light in fibre travels about 200,000 km/s, about 5 µs per km one way ([TeleGeography](https://resources.telegeography.com/its-time-to-learn-about-latency), [CommScope white paper](https://www.commscope.com/globalassets/digizuite/2799-latency-in-optical-fiber-systems-wp-111432-en.pdf)). TeleGeography's rule of thumb is about 10 ms of round trip per 1,000 km. | Matches |
| Same region | about 0.5 ms | Typical in-region round trip between availability zones is under 2 ms | Simplified |
| Last mile to users | 5 ms | Varies widely by country and network | Teaching value |

Real routes are longer than great-circle distance, so real round trips are usually somewhat higher than ArchSim's.

## Data transfer

| Assumption | In ArchSim | Published figure | Status |
|---|---|---|---|
| Internet egress from a region | $0.09/GB for the first 10 TB, $0.085 to 50 TB, $0.07 to 150 TB, $0.05 above | The same four tiers for EC2 and S3 egress in US and EU regions, after a 100 GB monthly free allowance ([egresscost.com, verified 2026-06](https://egresscost.com/aws/data-transfer-pricing), [AWS VPC pricing](https://aws.amazon.com/en/vpc/pricing/)) | Matches, without the free allowance |
| Cross-region transfer | $0.02/GB | Usually $0.01 to $0.02/GB depending on the regions | Matches the common case |
| CDN egress | $0.085/GB for the first 10 TB, $0.08, $0.06, $0.04, then $0.025 | CloudFront in North America and Europe: $0.085, $0.080, $0.060, $0.040, falling to $0.020 above 5 PB ([egresscost.com](https://egresscost.com/aws/cloudfront-pricing), [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go)) | Simplified at the very top tier |
| CDN requests | $0.75 per million | $0.0075 per 10,000 HTTPS requests for Price Class 100 ([CloudZero](https://www.cloudzero.com/blog/cloudfront-pricing)) | Matches |

## Compute

| Assumption | In ArchSim | Published figure | Status |
|---|---|---|---|
| Instance price | S $0.05/h, M $0.10/h, L $0.20/h, XL $0.40/h; each size doubles capacity and price | General-purpose on-demand instances cost roughly $0.04 to $0.10/h per 2 vCPU depending on family and region | Teaching value: in the range, but one blended price per size rather than per family |
| ARM instances | 20% cheaper | AWS says Graviton instances cost up to 20% less than comparable x86 instances ([AWS Graviton](https://aws.amazon.com/jp/graviton/)) | Matches |
| Reserved capacity | 40% off the committed baseline | AWS advertises larger discounts for long, upfront commitments; 40% is typical for a one-year commitment with no upfront payment | Simplified |
| Spot | 70% off, with 8% of capacity lost to reclaims | Spot discounts vary by instance type and hour | Teaching value |

## Queues and latency inside a component

| Assumption | In ArchSim | Source | Status |
|---|---|---|---|
| Waiting time as load rises | M/D/1 queue: base × (1 + u ÷ (2(1 − u))) | Standard result for a single server with fixed service time ([Wikipedia: M/D/1 queue](https://en.wikipedia.org/wiki/M/D/1_queue)) | Matches the model |
| Tail latency | p99 per hop ≈ base × (1.5 + 2u ÷ (1 − u)); along a path the tails combine like variances | An approximation that keeps p99 rising sharply near saturation without simulating single requests | Teaching value |
| Per-instance throughput and service time | Set per component in `src/sim/catalog.ts` | Order-of-magnitude figures, such as a cache answering in about 1 ms and a SQL primary handling a few thousand writes a second | Teaching value |

## Change a number

The figures live in `src/sim/engine.ts` (`ASSUMPTIONS`, the transfer tiers) and `src/sim/catalog.ts` (sizes, components, pricing levers). If you have a better figure, change it, run `npm test` to see which challenges it affects, and link your source in the pull request.
