/**
 * Company case studies: how real systems work, in plain words, with sources.
 * Each article pairs with a runnable challenge in src/sim/companies.ts (`challenge`).
 * Figures are what the company published at the time; the year is on every source.
 * [n] in a paragraph points at sources[n - 1].
 */

export interface KeyNumber {
  value: string
  label: string
  /** 1-based index into sources */
  src: number
}

export interface Source {
  title: string
  publisher: string
  year: number
  url: string
}

export interface Article {
  id: string
  company: string
  challenge: string
  headline: string
  lede: string
  /** what kind of problem this is, used for filtering */
  themes: Theme[]
  numbers: KeyNumber[]
  sections: { title: string; body: string[] }[]
  lessons: string[]
  sources: Source[]
}

export type Theme = 'Caching & CDN' | 'Databases & sharding' | 'Real-time' | 'Reliability' | 'Multi-region' | 'Streams & queues' | 'Payments'

export const THEMES: Theme[] = ['Caching & CDN', 'Databases & sharding', 'Real-time', 'Streams & queues', 'Multi-region', 'Reliability', 'Payments']

export const ARTICLES: Article[] = [
  {
    id: 'netflix', company: 'Netflix', challenge: 'co-netflix',
    headline: 'How Netflix gets video from the cloud to your TV',
    lede: 'Netflix runs two very different systems. The part you click through lives in AWS. The part that sends video lives inside your internet provider.',
    themes: ['Caching & CDN', 'Multi-region', 'Reliability'],
    numbers: [
      { value: '100 %', label: 'of video served by Netflix\'s own CDN, Open Connect', src: 1 },
      { value: '~90 %', label: 'of that traffic over direct links between ISPs and Open Connect', src: 1 },
      { value: '3', label: 'AWS regions running the control plane active-active', src: 2 },
      { value: '~30M', label: 'EVCache requests per second', src: 4 },
    ],
    sections: [
      { title: 'Two planes', body: [
        'Everything before you press play (signing in, browsing rows, picking an episode) is the control plane. It is a large set of microservices running in AWS, reached through an edge gateway called Zuul. Everything after you press play is the data plane: chunks of video sent from the closest cache that has them.',
        'The split matters because the two have opposite needs. The control plane is many small, varied requests that change often. The data plane is a few enormous, repeated files. Netflix gives each the infrastructure that suits it.',
      ] },
      { title: 'A CDN inside the ISP', body: [
        'Since 2011 Netflix has built its own CDN, Open Connect. It gives internet providers cache servers, called Open Connect Appliances, to install in their own networks, and also places them at internet exchange points. Popular titles are copied to these boxes overnight, so when you press play the bytes often travel only a few hops [1].',
        'For the provider this saves transit costs; for Netflix it means the cloud never carries video at all. That is why the board puts a CDN in front of everything with a very high hit rate.',
      ] },
      { title: 'Active-active after Christmas Eve', body: [
        'On Christmas Eve 2012 a problem with load balancing in a single AWS region took Netflix down for hours. The response was to run the control plane in several regions at once, each able to take all the traffic [2][3].',
        'Today members are steered to a nearby region, but if one region degrades, traffic is shifted to the others in minutes. Netflix rehearses this regularly by simulating the loss of a whole region, an exercise it calls Chaos Kong.',
      ] },
      { title: 'Caching state everywhere', body: [
        'Each region keeps a full copy of member data in Cassandra, and in front of it sits EVCache, a memcached-based cache that replicates across regions. It answers tens of millions of requests a second, so the databases see a small share of the reads [4].',
      ] },
    ],
    lessons: [
      'Separate traffic by shape: small dynamic requests and huge static files want different systems.',
      'Put heavy bytes as close to the viewer as possible. The cheapest network hop is the one you skip.',
      'Active-active only works if you practise failing over. Untested failover is a hope, not a plan.',
    ],
    sources: [
      { title: 'How Netflix works with ISPs around the globe to deliver a great viewing experience', publisher: 'Netflix', year: 2016, url: 'https://about.netflix.com/en/news/how-netflix-works-with-isps-around-the-globe-to-deliver-a-great-viewing-experience' },
      { title: 'Netflix Everywhere: global architecture (QCon London)', publisher: 'QCon / Josh Evans', year: 2016, url: 'https://qconlondon.com/london-2016/system/files/presentation-slides/joshevans-netflixeverywhereglobalarchitecture_qconlondon2016.pdf' },
      { title: 'How Netflix leverages multiple regions to increase availability', publisher: 'QCon / Ruslan Meshenberg', year: 2014, url: 'https://qconlondon.com/london-2014/london-2014/presentation/How%20Netflix%20Leverages%20Multiple%20Regions%20to%20Increase%20Availability-%20An%20Active-Active%20Case%20Study.html' },
      { title: 'Netflix\'s global cache: EVCache at scale', publisher: 'InfoQ', year: 2024, url: 'https://www.infoq.com/articles/netflix-global-cache/' },
    ],
  },
  {
    id: 'amazon', company: 'Amazon', challenge: 'co-prime-day',
    headline: 'How Amazon survives Prime Day',
    lede: 'Prime Day is a planned traffic spike on one of the largest shops in the world. AWS publishes the numbers afterwards, and they show where the load really goes.',
    themes: ['Databases & sharding', 'Caching & CDN', 'Reliability'],
    numbers: [
      { value: '146M', label: 'DynamoDB requests per second at the 2024 peak', src: 1 },
      { value: '> 1T', label: 'ElastiCache requests per minute at peak (2024)', src: 1 },
      { value: '500M+', label: 'CloudFront HTTP requests per minute at peak (2024)', src: 1 },
      { value: '151M', label: 'DynamoDB requests per second at the 2025 peak', src: 2 },
    ],
    sections: [
      { title: 'Where the load goes', body: [
        'The figures AWS publishes after each Prime Day are a map of the architecture. Shopping pages and images go through the CloudFront CDN. Product data, carts and sessions are read from in-memory ElastiCache and from DynamoDB, a key-value store that keeps single-digit-millisecond latency as traffic grows [1].',
        'Notice the ratios: the cache handles roughly ten times more requests than the database. Most reads are answered before they ever reach a store of record.',
      ] },
      { title: 'Why a key-value store', body: [
        'A relational database can do almost anything, but under a sudden 10x load its latency becomes hard to predict: locks, joins and hot indexes all get worse together. A key-value store does less, but splits data into partitions that each handle a known amount of traffic. Adding partitions adds capacity in a straight line.',
        'For data that is looked up by key (a cart by customer, a product by ID), that trade is worth it. Orders and payments still need transactions, and they get their own systems.',
      ] },
      { title: 'Rehearsed in advance', body: [
        'Amazon does not wait for autoscaling to discover Prime Day. Capacity is planned and pre-scaled, and teams run fault-injection experiments beforehand to see what breaks; AWS reported thousands of such experiments before the 2025 event [2].',
      ] },
    ],
    lessons: [
      'Cache first, then the database. The cheapest request is the one a cache answers.',
      'Choose stores whose latency stays flat as load grows, for the data that sees the spike.',
      'For a spike you can see coming, pre-scale. Autoscaling reacts; it does not predict.',
    ],
    sources: [
      { title: 'How AWS powered Prime Day 2024 for record-breaking sales', publisher: 'AWS News Blog', year: 2024, url: 'https://aws.amazon.com/blogs/aws/how-aws-powered-prime-day-2024-for-record-breaking-sales' },
      { title: 'AWS services scale to new heights for Prime Day 2025', publisher: 'AWS News Blog', year: 2025, url: 'https://aws.amazon.com/blogs/aws/aws-services-scale-to-new-heights-for-prime-day-2025-key-metrics-and-milestones' },
    ],
  },
  {
    id: 'discord', company: 'Discord', challenge: 'co-discord',
    headline: 'How Discord stores trillions of messages',
    lede: 'One huge community can generate more reads than thousands of small ones. Discord\'s message store had to survive both, and its fix was as much about the layer in front of the database as the database itself.',
    themes: ['Databases & sharding', 'Real-time'],
    numbers: [
      { value: '177 → 72', label: 'database nodes after moving from Cassandra to ScyllaDB', src: 1 },
      { value: '40–125 → 15 ms', label: 'p99 latency for reading message history', src: 1 },
      { value: '9 days', label: 'to migrate trillions of messages', src: 1 },
    ],
    sections: [
      { title: 'Hot partitions', body: [
        'Messages are stored by channel and by time bucket, so all recent messages in a channel sit together. That makes reading a channel fast, but it also means a channel with a huge, active audience concentrates its reads on a few database nodes. When those nodes fell behind, latency rose for everyone sharing them [1].',
      ] },
      { title: 'Data services', body: [
        'Discord added a layer of data services written in Rust between its API and the database. When many users ask for the same channel at the same moment, the data service sends one query and shares the answer with all of them. This request coalescing turns a stampede into a single read [1].',
        'On the board, that layer is modelled as a cache: it is not storing data for long, but it stops identical requests from reaching the database.',
      ] },
      { title: 'A new database', body: [
        'The team also moved from Cassandra to ScyllaDB, a compatible database without the garbage-collection pauses that had caused latency spikes. The cluster shrank from 177 nodes to 72 and tail latency for history reads dropped to about 15 ms [1].',
      ] },
    ],
    lessons: [
      'Partition keys decide where hot spots land. Plan for the most popular key, not the average one.',
      'A thin layer that merges identical requests can matter more than a faster database.',
      'Push new messages over a held connection instead of having clients poll for them.',
    ],
    sources: [
      { title: 'How Discord stores trillions of messages', publisher: 'Discord Engineering', year: 2023, url: 'https://discord.com/blog/how-discord-stores-trillions-of-messages' },
    ],
  },
  {
    id: 'instagram', company: 'Instagram', challenge: 'co-instagram',
    headline: 'How Instagram sharded Postgres with a tiny team',
    lede: 'Instagram grew fast with very few engineers. Rather than adopt a new database, it split Postgres into thousands of small logical shards and made every ID say where its data lives.',
    themes: ['Databases & sharding', 'Caching & CDN'],
    numbers: [
      { value: '1000s', label: 'logical shards mapped onto a few physical servers', src: 1 },
      { value: '64 bits', label: 'per ID: 41 for time, 13 for shard, 10 for sequence', src: 1 },
    ],
    sections: [
      { title: 'Logical before physical', body: [
        'Instagram created thousands of logical shards, each a Postgres schema, and placed many of them on each physical database server. Moving load later means moving a few schemas to a new machine, not re-splitting rows [1].',
        'The board shows this as a sharded SQL database. The important property is that the number of logical shards is fixed and large, while the number of machines can grow.',
      ] },
      { title: 'IDs that know their shard', body: [
        'Each new ID is generated inside Postgres: the time in milliseconds, then the logical shard number, then a short sequence. Because the shard is inside the ID, any service can find a photo\'s data without asking a lookup service, and IDs still sort by time [1].',
      ] },
      { title: 'The rest of the stack', body: [
        'Photo files never went into the database. They live in object storage and are served through a CDN, and memcached sits in front of the databases for the many repeated reads that a feed generates.',
      ] },
    ],
    lessons: [
      'Make many small logical shards early. They are cheap to create and easy to move.',
      'Encode the shard in the ID so routing needs no extra lookup.',
      'Keep big binary files out of the database entirely.',
    ],
    sources: [
      { title: 'Sharding & IDs at Instagram', publisher: 'Instagram Engineering', year: 2012, url: 'https://instagram-engineering.com/sharding-ids-at-instagram-1cf5a71e5a5c' },
    ],
  },
  {
    id: 'figma', company: 'Figma', challenge: 'co-figma',
    headline: 'How Figma scaled Postgres about 100x',
    lede: 'Figma kept Postgres and SQL while its database load grew by roughly two orders of magnitude. It did it in two moves: split tables apart, then split rows apart behind a proxy.',
    themes: ['Databases & sharding', 'Real-time'],
    numbers: [
      { value: '~100x', label: 'growth of the database stack since 2020', src: 1 },
      { value: '1 → dozen', label: 'Postgres databases by the end of 2022, before horizontal sharding', src: 1 },
    ],
    sections: [
      { title: 'Vertical partitioning first', body: [
        'In 2020 Figma ran a single Postgres on the largest instance AWS offered. The first fix was vertical partitioning: moving groups of related tables, such as files or comments, to their own databases. Each group got a whole machine of headroom [2].',
        'This is fast to do and needs little application change, but a single table can still outgrow one machine. Some of Figma\'s tables reached several terabytes and billions of rows [1].',
      ] },
      { title: 'DBProxy and horizontal shards', body: [
        'For those tables Figma built DBProxy, a service that sits between the application and Postgres. It parses each query, works out which shard it belongs to from the shard key, and routes it there. Application code keeps writing ordinary SQL [1].',
        'They first introduced logical sharding (the application behaves as if data were split, while it still lives on one machine), checked that everything worked, and only then split the data physically. Related tables share a shard key so that queries rarely need to cross shards.',
      ] },
    ],
    lessons: [
      'Vertical partitioning buys time cheaply. Do it before you need horizontal sharding.',
      'A routing proxy lets you shard without rewriting every query.',
      'Roll out the logic of sharding before the physical split, so you can test it safely.',
    ],
    sources: [
      { title: 'How Figma\'s databases team lived to tell the scale', publisher: 'Figma Blog', year: 2024, url: 'https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/' },
      { title: 'How Figma scaled to multiple databases', publisher: 'Figma Blog', year: 2023, url: 'https://www.figma.com/blog/how-figma-scaled-to-multiple-databases/' },
    ],
  },
  {
    id: 'dropbox', company: 'Dropbox', challenge: 'co-dropbox',
    headline: 'How Dropbox built its own exabyte storage',
    lede: 'Dropbox moved hundreds of petabytes off public cloud storage into a system of its own called Magic Pocket. The design rests on one idea: files are made of immutable blocks.',
    themes: ['Databases & sharding', 'Caching & CDN'],
    numbers: [
      { value: '500 PB', label: 'of user data moved from AWS into Magic Pocket', src: 3 },
      { value: '4 MB', label: 'maximum size of an immutable, content-addressed block', src: 1 },
      { value: '99.99 %', label: 'availability target at exabyte scale', src: 2 },
    ],
    sections: [
      { title: 'Blocks, not files', body: [
        'A file is cut into blocks of up to 4 MB. Each block is encrypted and named by a hash of its contents, so two identical blocks have the same name and are stored once. Blocks never change; editing a file produces new blocks and a new list of which blocks make up the file [1].',
        'That separates the problem in two. Metadata (which blocks belong to which file, in which folder, for which user) is small and lives in databases. Block data is huge and lives in Magic Pocket.',
      ] },
      { title: 'Why sync is mostly metadata', body: [
        'A desktop client asks, many times a day, whether anything changed. Almost always the answer is a short metadata reply. Only when blocks are missing does the client download them. On the board, most traffic is checks, so caching the metadata matters more than the block store.',
      ] },
      { title: 'Cheap and durable', body: [
        'Magic Pocket spreads data across regions and uses erasure coding, which stores encoded fragments instead of full copies, to keep durability high without tripling the disk bill. Older, rarely read data moves to a colder tier [2][4].',
      ] },
    ],
    lessons: [
      'Split metadata from data. They have different sizes, access patterns and costs.',
      'Content addressing gives you deduplication for free.',
      'At large enough scale, cost per gigabyte can justify building your own storage.',
    ],
    sources: [
      { title: 'Inside the Magic Pocket', publisher: 'Dropbox Tech Blog', year: 2016, url: 'https://dropbox.tech/infrastructure/inside-the-magic-pocket' },
      { title: 'How Dropbox\'s Magic Pocket stores exabytes', publisher: 'InfoQ', year: 2023, url: 'https://www.infoq.com/articles/dropbox-magic-pocket-exabyte-storage' },
      { title: 'Scaling to exabytes and beyond', publisher: 'Dropbox Blog', year: 2016, url: 'https://blog.dropbox.com/topics/technology/moving-500-petabytes-of-user-data-into-our-magic-pocket' },
      { title: 'How we optimized Magic Pocket for cold storage', publisher: 'Dropbox Tech Blog', year: 2019, url: 'https://dropbox.tech/infrastructure/how-we-optimized-magic-pocket-for-cold-storage' },
    ],
  },
  {
    id: 'uber', company: 'Uber', challenge: 'co-uber',
    headline: 'How Uber matches riders and drivers',
    lede: 'Every few seconds every driver\'s phone reports where it is. Matching a rider means asking which of those positions are close, right now, without asking a database.',
    themes: ['Real-time', 'Streams & queues'],
    numbers: [
      { value: '4 s', label: 'between location updates from each driver\'s phone', src: 2 },
      { value: 'Hexagons', label: 'H3 grid cells used to group supply and demand', src: 1 },
    ],
    sections: [
      { title: 'Supply, demand and a matcher', body: [
        'Uber\'s dispatch system was split into services for supply (drivers and their state), demand (riders and their requests), and a matcher, DISCO, that pairs them. Driver phones send their position every four seconds [2].',
        'Those updates are short-lived: a position is useless a few seconds later. So they flow through a stream into in-memory state rather than being written as rows to a relational database.',
      ] },
      { title: 'A map made of hexagons', body: [
        'To ask who is nearby, the city is divided into cells. Uber later open-sourced H3, a grid of hexagons at many resolutions. Hexagons have the useful property that every neighbour is the same distance away, which makes questions like supply within two rings of this rider simple. Surge pricing is computed per hexagon from supply and demand [1].',
      ] },
    ],
    lessons: [
      'Data that is overwritten every few seconds belongs in a stream and memory, not in SQL.',
      'Index location with a grid so nearby becomes a lookup, not a scan.',
      'Split a busy system by what changes together: drivers, riders, and the decision between them.',
    ],
    sources: [
      { title: 'H3: Uber\'s hexagonal hierarchical spatial index', publisher: 'Uber Engineering', year: 2018, url: 'https://www.uber.com/blog/h3/' },
      { title: 'Uber\'s real-time market platform (Matt Ranney)', publisher: 'InfoQ', year: 2015, url: 'https://www.infoq.com/news/2015/03/uber-realtime-market-platform' },
    ],
  },
  {
    id: 'whatsapp', company: 'WhatsApp', challenge: 'co-whatsapp',
    headline: 'How WhatsApp held millions of connections per server',
    lede: 'WhatsApp became famous for serving a huge user base with a very small team. A big part of the answer was holding an enormous number of open connections on each machine.',
    themes: ['Real-time'],
    numbers: [
      { value: '2.27M', label: 'simultaneous TCP connections on one server (2012)', src: 1 },
      { value: 'Erlang', label: 'on FreeBSD, the runtime behind the chat servers', src: 1 },
    ],
    sections: [
      { title: 'Connections, not requests', body: [
        'A chat app does not need phones to keep asking for news. Each phone opens one connection and keeps it; the server pushes a message down it the moment one arrives. The cost moves from handling requests to holding connections, and Erlang, with its very cheap lightweight processes, is good at holding a lot of them [1][2].',
        'In early 2012 WhatsApp reported more than two million connections on a single server after tuning the operating system and the runtime [1].',
      ] },
      { title: 'Store and forward', body: [
        'If the recipient is offline, the message waits on the server and is deleted once delivered. A push notification through Apple or Google wakes the phone so it reconnects and collects it. The server is a post office, not an archive [2].',
      ] },
    ],
    lessons: [
      'For two-way, low-latency traffic, keep connections open and push.',
      'Pick a runtime that makes your bottleneck cheap. For WhatsApp that was concurrent connections.',
      'Only keep what you must: undelivered messages, deleted on delivery.',
    ],
    sources: [
      { title: '1 million is so 2011', publisher: 'WhatsApp Blog', year: 2012, url: 'https://blog.whatsapp.com/1-million-is-so-2011' },
      { title: 'Scaling to millions of simultaneous connections (Rick Reed, Erlang Factory)', publisher: 'Erlang Factory', year: 2012, url: 'https://www.slideshare.net/slideshow/whatsapps-architecture/57522146' },
    ],
  },
  {
    id: 'slack', company: 'Slack', challenge: 'co-slack',
    headline: 'How Slack delivers messages in real time',
    lede: 'Sending a message to a channel means reaching every member who is online, wherever they are connected. Slack built a small family of specialised servers to do just that.',
    themes: ['Real-time', 'Caching & CDN', 'Multi-region'],
    numbers: [
      { value: '4 roles', label: 'channel, gateway, admin and presence servers', src: 1 },
      { value: 'Edge', label: 'Flannel caches boot data close to users', src: 2 },
    ],
    sections: [
      { title: 'Gateways and channel servers', body: [
        'Clients hold a WebSocket to a gateway server in a nearby region. Gateways know which channels their users belong to. Channel servers own channels (each channel hashed to one server) and keep recent state in memory. A new message goes to its channel server, which sends it to every gateway that has a member subscribed, and the gateways push it down the sockets [1].',
        'On the board, the channel servers are a pub/sub topic, and the gateways are WebSocket servers in two regions.',
      ] },
      { title: 'Making boot fast', body: [
        'Older Slack clients downloaded the whole workspace (every user and channel) when they started, which became slow for large companies. Flannel is an application-level edge cache that holds this data near users and hands it to clients lazily, only what the screen needs [2].',
      ] },
    ],
    lessons: [
      'Put connection-holding servers near users and keep the fan-out logic in one place.',
      'Assign each channel to one owner with consistent hashing so its state stays coherent.',
      'Load what the screen needs, not everything that exists.',
    ],
    sources: [
      { title: 'Real-time messaging', publisher: 'Slack Engineering', year: 2023, url: 'https://slack.engineering/real-time-messaging/' },
      { title: 'Flannel: an application-level edge cache to make Slack scale', publisher: 'Slack Engineering', year: 2017, url: 'https://slack.engineering/flannel-an-application-level-edge-cache-to-make-slack-scale/' },
    ],
  },
  {
    id: 'stripe', company: 'Stripe', challenge: 'co-stripe',
    headline: 'How Stripe makes retries safe with idempotency keys',
    lede: 'When a payment request times out, the client cannot tell whether the charge happened. Stripe\'s answer is a header every engineer should know.',
    themes: ['Payments', 'Reliability', 'Streams & queues'],
    numbers: [
      { value: '$1.4T', label: 'total payment volume processed in 2024', src: 3 },
      { value: '24 h', label: 'after which an idempotency key can be pruned', src: 2 },
    ],
    sections: [
      { title: 'The problem with retries', body: [
        'Networks fail in the worst way: after the work is done but before the reply arrives. A client that retries a charge in that case charges twice. A client that does not retry may lose a sale. Neither is acceptable for payments [1].',
      ] },
      { title: 'Idempotency keys', body: [
        'The client generates a unique key and sends it with the request in an Idempotency-Key header. The server stores the key with the result of the first request. If the same key arrives again, the server returns the stored result instead of doing the work again, whether the first attempt succeeded or failed [1][2].',
        'Clients retry with exponential backoff and jitter, so a brief outage does not turn into a stampede of retries.',
      ] },
      { title: 'Webhooks off the hot path', body: [
        'Merchants learn about results through webhooks. Sending them inline would let a slow merchant endpoint hold up payments, so events are queued and delivered by workers that retry on their own schedule. The board models this with a queue and workers in front of the merchant endpoints.',
      ] },
    ],
    lessons: [
      'Any operation that moves money must be safe to repeat.',
      'Record the key and outcome durably before replying.',
      'Retry with backoff and jitter, and never block the main path on someone else\'s server.',
    ],
    sources: [
      { title: 'Designing robust and predictable APIs with idempotency', publisher: 'Stripe Blog', year: 2017, url: 'https://stripe.com/blog/idempotency' },
      { title: 'Idempotent requests (API reference)', publisher: 'Stripe Docs', year: 2025, url: 'https://docs.stripe.com/api/idempotent_requests' },
      { title: 'Stripe 2024 annual letter', publisher: 'Stripe Newsroom', year: 2025, url: 'https://stripe.com/newsroom/news/stripe-2024-update' },
    ],
  },
  {
    id: 'shopify', company: 'Shopify', challenge: 'co-shopify',
    headline: 'How Shopify handles Black Friday',
    lede: 'Millions of independent shops share one platform, and on Black Friday any of them might be the one that goes viral. Shopify\'s answer is isolation: many small Shopifys instead of one big one.',
    themes: ['Databases & sharding', 'Reliability', 'Caching & CDN'],
    numbers: [
      { value: '284M', label: 'edge requests per minute at the BFCM 2024 peak', src: 1 },
      { value: '1.19T', label: 'edge requests over BFCM 2024', src: 1 },
      { value: '100+', label: 'pods, each with its own datastores', src: 3 },
    ],
    sections: [
      { title: 'Pods', body: [
        'By 2015 Shopify could no longer buy a bigger database server. Sharding helped, but a failing shard could still drag down shared parts of the platform. So in 2016 it introduced pods: a pod is a set of shops on a fully isolated set of datastores (MySQL, Redis, memcached). A routing layer sends each request to the pod that owns its shop [2].',
        'Since then a bad day in one pod stays in that pod. Shopify has said it has not had a platform-wide outage since adopting the design [3].',
      ] },
      { title: 'Edge, queues, rehearsal', body: [
        'Storefront pages are cached at the edge, so most browsing never reaches a pod. Work that does not need to happen inside the shopper\'s request, such as many checkout side effects, runs as background jobs. And before every Black Friday Shopify runs game days, load and failure tests at event scale [1][4].',
      ] },
    ],
    lessons: [
      'Isolate tenants so one hot customer cannot take down the rest.',
      'Cache what is the same for every visitor at the edge.',
      'Rehearse the peak. Load tests and game days find the limits before customers do.',
    ],
    sources: [
      { title: 'Shopify BFCM 2024 data', publisher: 'Shopify News', year: 2024, url: 'https://www.shopify.com/news/bfcm-data-2024' },
      { title: 'A pods architecture to allow Shopify to scale', publisher: 'Shopify Engineering', year: 2018, url: 'https://shopify.engineering/a-pods-architecture-to-allow-shopify-to-scale' },
      { title: 'E-commerce at scale: inside Shopify\'s tech stack', publisher: 'Shopify Engineering', year: 2018, url: 'https://shopify.engineering/e-commerce-at-scale-inside-shopifys-tech-stack' },
      { title: 'BFCM readiness', publisher: 'Shopify Engineering', year: 2025, url: 'https://shopify.engineering/bfcm-readiness-2025' },
    ],
  },
  {
    id: 'cloudflare', company: 'Cloudflare', challenge: 'co-cloudflare',
    headline: 'How Cloudflare runs one network in hundreds of cities',
    lede: 'Cloudflare sits in front of a large share of the web. Every data center runs the same software, and the internet\'s own routing sends each visitor to the closest one.',
    themes: ['Caching & CDN', 'Reliability', 'Multi-region'],
    numbers: [
      { value: '330', label: 'cities with Cloudflare data centers', src: 1 },
      { value: '81M', label: 'HTTP requests per second on average in 2025', src: 1 },
      { value: '129M', label: 'HTTP requests per second at peak in 2025', src: 1 },
    ],
    sections: [
      { title: 'Anycast', body: [
        'Every Cloudflare location announces the same IP addresses. The internet\'s routing protocol, BGP, naturally delivers each visitor\'s packets to the nearest location announcing them. There is no central load balancer deciding where you go; the network itself does it.',
        'Because every server runs every service (caching, firewall, DNS, edge code), any location can handle any request, and a failing location simply stops announcing addresses.',
      ] },
      { title: 'Doing the work at the edge', body: [
        'A request arriving in Jakarta is filtered by the firewall in Jakarta, answered from the Jakarta cache if possible, and can run custom code there too. Only what is left goes to the origin server. Attacks are absorbed in many cities at once instead of converging on one.',
      ] },
    ],
    lessons: [
      'Drop bad traffic as close to its source as possible.',
      'Identical software everywhere makes every location a backup for every other.',
      'The best origin request is the one that never happens.',
    ],
    sources: [
      { title: 'Cloudflare Radar 2025 year in review', publisher: 'Cloudflare Blog', year: 2025, url: 'https://blog.cloudflare.com/radar-2025-year-in-review/' },
    ],
  },
  {
    id: 'linkedin', company: 'LinkedIn', challenge: 'co-linkedin',
    headline: 'How LinkedIn built Kafka to connect everything',
    lede: 'Kafka started at LinkedIn as a way to stop every system from calling every other system. It became the backbone that carries trillions of events a day.',
    themes: ['Streams & queues'],
    numbers: [
      { value: '7T+', label: 'messages a day through LinkedIn\'s Kafka (2019)', src: 1 },
      { value: '4,000+', label: 'Kafka brokers across 100+ clusters', src: 1 },
      { value: '100,000+', label: 'topics', src: 1 },
    ],
    sections: [
      { title: 'Too many arrows', body: [
        'A page view at LinkedIn is interesting to many systems: search indexing, analytics, recommendations, monitoring, abuse detection. Wiring each producer to each consumer creates a web of point-to-point links where any slow consumer can slow the site [2].',
      ] },
      { title: 'A shared log', body: [
        'Kafka is a log split into partitions. Producers append events once. Each consumer reads at its own pace and remembers its own position, so a slow consumer only falls behind; it does not slow anyone else. Events are kept for a set time, so a new system can read from the past to build its view [2].',
        'Stream processors (at LinkedIn, Samza) read the log and build derived data such as search indexes and aggregates.',
      ] },
    ],
    lessons: [
      'Publish once, consume many times. A log decouples producers from every consumer.',
      'Retention turns a message bus into a source you can replay.',
      'Let each consumer fall behind on its own without dragging the producer down.',
    ],
    sources: [
      { title: 'How LinkedIn customizes Apache Kafka for 7 trillion messages per day', publisher: 'LinkedIn Engineering', year: 2019, url: 'https://engineering.linkedin.com/blog/2019/apache-kafka-trillion-messages' },
      { title: 'Running Kafka at scale', publisher: 'LinkedIn Engineering', year: 2015, url: 'https://engineering.linkedin.com/kafka/running-kafka-scale' },
    ],
  },
  {
    id: 'meta', company: 'Meta', challenge: 'co-meta-tao',
    headline: 'How Meta serves the social graph with TAO',
    lede: 'Every Facebook page asks many questions about who knows whom and who liked what. TAO is the cache-heavy system that answers them, around a billion reads a second.',
    themes: ['Caching & CDN', 'Databases & sharding'],
    numbers: [
      { value: '~1B', label: 'reads per second, plus millions of writes', src: 1 },
      { value: '99.8 %', label: 'of requests are reads', src: 1 },
    ],
    sections: [
      { title: 'Objects and associations', body: [
        'TAO models data as a graph: objects (people, posts, pages) and associations between them (friend of, liked, authored). Its API asks graph questions directly, such as the most recent comments on this post, which a generic cache cannot do efficiently [1][2].',
      ] },
      { title: 'Followers and leaders', body: [
        'Durable data lives in sharded MySQL. In front of it are two cache tiers. Many follower caches serve reads close to the web servers. Each shard also has a leader cache, and followers send their misses and writes to the leader rather than to MySQL. So even if a hundred followers miss on the same item, MySQL sees one request [1].',
        'The system is eventually consistent across regions: a read may briefly see old data, a trade Meta accepted for speed at this scale.',
      ] },
    ],
    lessons: [
      'When reads outnumber writes 500 to 1, design the read path first.',
      'Layer caches so misses are merged before they reach the database.',
      'Choose the consistency your product can tolerate, and say so explicitly.',
    ],
    sources: [
      { title: 'TAO: Facebook\'s distributed data store for the social graph', publisher: 'USENIX ATC', year: 2013, url: 'https://www.usenix.org/conference/atc13/technical-sessions/presentation/bronson' },
      { title: 'TAO: the power of the graph', publisher: 'Engineering at Meta', year: 2013, url: 'https://engineering.fb.com/2013/06/25/core-infra/tao-the-power-of-the-graph/' },
    ],
  },
  {
    id: 'twitter', company: 'Twitter (X)', challenge: 'co-twitter',
    headline: 'How Twitter built home timelines',
    lede: 'Reading a timeline is far more common than posting a tweet. Twitter used that imbalance to do the work at write time and make reads a single lookup.',
    themes: ['Caching & CDN', 'Streams & queues'],
    numbers: [
      { value: '300K', label: 'timeline reads per second (2012)', src: 1 },
      { value: '~6K', label: 'tweets written per second (2012)', src: 1 },
      { value: '5 s', label: 'target for a tweet to reach followers\' timelines', src: 2 },
    ],
    sections: [
      { title: 'Fan-out on write', body: [
        'Building a timeline when someone opens the app means fetching recent tweets from everyone they follow and merging them, on every refresh. Instead, when a tweet is posted, workers insert its ID into the timeline list of every follower, held in Redis. Opening the app then reads one precomputed list [1][2].',
        'Posting becomes more expensive, because one tweet may be written into millions of lists. But there are about fifty reads for every write, so it is a good trade.',
      ] },
      { title: 'The celebrity problem', body: [
        'For accounts with enormous followings, fanning out every tweet is too slow. Those tweets are merged in at read time instead. Real systems are often a mix of both strategies, chosen per account [2].',
      ] },
    ],
    lessons: [
      'Do expensive work on the rarer operation.',
      'Precompute what users read most, and keep it in memory.',
      'Mix strategies when one rule fails for the extremes.',
    ],
    sources: [
      { title: 'Timelines at scale (Raffi Krikorian, QCon SF)', publisher: 'InfoQ', year: 2012, url: 'https://www.infoq.com/presentations/Twitter-Timeline-Scalability/' },
      { title: 'The architecture Twitter uses to deal with 150M active users', publisher: 'High Scalability', year: 2013, url: 'https://highscalability.com/the-architecture-twitter-uses-to-deal-with-150m-active-users/' },
    ],
  },
  {
    id: 'youtube', company: 'YouTube', challenge: 'co-youtube',
    headline: 'How YouTube scaled MySQL with Vitess',
    lede: 'YouTube\'s metadata outgrew a single MySQL. Instead of leaving MySQL, YouTube built a layer in front of it that makes many MySQL servers look like one.',
    themes: ['Databases & sharding'],
    numbers: [
      { value: '2010', label: 'Vitess created at YouTube', src: 1 },
      { value: 'CNCF', label: 'now an open-source graduated project', src: 1 },
    ],
    sections: [
      { title: 'VTGate and VTTablet', body: [
        'Applications connect to VTGate, a stateless proxy that speaks the MySQL protocol. VTGate reads a topology of which shard holds which rows and sends each query to the right place, combining results when needed [2].',
        'Beside every MySQL runs a VTTablet, which pools connections, rejects queries that would hurt the database, and manages replication. Thousands of application servers no longer each hold their own connections to every database [2].',
      ] },
      { title: 'Resharding as an operation', body: [
        'Vitess can split a shard into more shards while it is serving traffic, copying data and switching over when the copy catches up. Sharding stops being a one-off project and becomes something the team does when a shard grows too big.',
      ] },
    ],
    lessons: [
      'A proxy that speaks the database\'s own protocol lets you shard without changing apps.',
      'Connection pooling matters as much as raw capacity at large fan-in.',
      'Make resharding routine, not heroic.',
    ],
    sources: [
      { title: 'Vitess history', publisher: 'Vitess Docs', year: 2024, url: 'https://vitess.io/docs/overview/history/' },
      { title: 'What is Vitess', publisher: 'Vitess Docs', year: 2024, url: 'https://vitess.io/docs/overview/whatisvitess' },
    ],
  },
  {
    id: 'google', company: 'Google', challenge: 'co-spanner',
    headline: 'How Google\'s Spanner stays consistent across the planet',
    lede: 'Spanner is a SQL database replicated across continents that still gives every transaction one global order. Its secret is a clock that admits how wrong it might be.',
    themes: ['Databases & sharding', 'Multi-region'],
    numbers: [
      { value: 'Paxos', label: 'replication group per shard, across data centers', src: 1 },
      { value: 'TrueTime', label: 'clock API built on GPS and atomic clocks', src: 1 },
    ],
    sections: [
      { title: 'Shards replicated by consensus', body: [
        'Spanner splits data into shards and replicates each shard with its own Paxos group spread over several data centers. A write commits once a majority of replicas agree, so losing a data center does not lose data or stop the shard [1].',
      ] },
      { title: 'TrueTime and commit wait', body: [
        'Ordering transactions across machines normally needs coordination. Spanner instead uses TrueTime, which returns an interval: the current time is somewhere between these two values. The interval is kept small with GPS receivers and atomic clocks. A transaction picks a timestamp and then waits until that time has certainly passed everywhere before it reports success. After that, any later transaction anywhere gets a later timestamp [1][2].',
        'The cost is a few milliseconds of waiting on writes. The gain is external consistency: if one transaction finishes before another starts, every reader sees them in that order. Google\'s ads system was Spanner\'s first big customer, where totals and budgets have to be right.',
      ] },
    ],
    lessons: [
      'Strong consistency across regions is possible, but you pay for it in write latency.',
      'Knowing the bounds of your uncertainty is as useful as removing it.',
      'Use the strongest consistency only where correctness is worth the latency.',
    ],
    sources: [
      { title: 'Spanner: Google\'s globally distributed database', publisher: 'OSDI', year: 2012, url: 'https://research.google/pubs/spanner-googles-globally-distributed-database-2/' },
      { title: 'TrueTime and external consistency', publisher: 'Google Cloud Docs', year: 2025, url: 'https://cloud.google.com/spanner/docs/true-time-external-consistency' },
    ],
  },
  {
    id: 'github', company: 'GitHub', challenge: 'co-github',
    headline: 'How GitHub broke up its main database',
    lede: 'GitHub began as a Rails app on one MySQL database, and for years one cluster held most of everything. Splitting it took tooling, rules and patience more than new technology.',
    themes: ['Databases & sharding'],
    numbers: [
      { value: '50 %', label: 'less load on the main cluster after partitioning', src: 1 },
      { value: '5.5M', label: 'queries per second across 50+ MySQL clusters (2023)', src: 2 },
      { value: '1,200+', label: 'MySQL hosts holding 300+ TB', src: 2 },
    ],
    sections: [
      { title: 'Schema domains', body: [
        'The team grouped tables into schema domains: sets of tables that are used together, such as repositories or notifications. They added linters that flag any query or transaction that crosses domains, then fixed those call sites one by one. Once a domain was self-contained it could live on its own cluster [1].',
      ] },
      { title: 'Moving without downtime', body: [
        'Tables were copied to new clusters with replication, and a carefully timed write cutover switched them over. Each cluster has a primary for writes and replicas for reads. Some of the largest domains were later sharded horizontally with Vitess [1][2].',
      ] },
    ],
    lessons: [
      'Find the seams in your data before you split it.',
      'Enforce boundaries with tooling, or new code will cross them again.',
      'Send reads to replicas so primaries only take writes.',
    ],
    sources: [
      { title: 'Partitioning GitHub\'s relational databases to handle scale', publisher: 'GitHub Blog', year: 2021, url: 'https://github.blog/engineering/infrastructure/partitioning-githubs-relational-databases-scale/' },
      { title: 'Upgrading GitHub.com to MySQL 8.0', publisher: 'GitHub Blog', year: 2023, url: 'https://github.blog/engineering/infrastructure/upgrading-github-com-to-mysql-8-0/' },
    ],
  },
  {
    id: 'airbnb', company: 'Airbnb', challenge: 'co-airbnb',
    headline: 'How Airbnb avoids double payments',
    lede: 'A booking touches several payment services and outside processors. Airbnb built a shared library so that every one of those calls is safe to retry.',
    themes: ['Payments', 'Reliability'],
    numbers: [
      { value: '3 phases', label: 'per request: before the call, the call, after the call', src: 1 },
    ],
    sections: [
      { title: 'One pattern for every service', body: [
        'Rather than each payments service inventing its own protection, Airbnb built Orpheus, a general idempotency library. Each request carries an idempotency key. Orpheus records the request and its progress in the database before the remote call and the outcome after it [1].',
        'A request is split into three phases. Before the remote call, only local database work happens. The remote call itself is the risky part. Afterwards, the result is saved. If anything fails, a retry with the same key knows exactly where the last attempt got to.',
      ] },
      { title: 'Knowing what to retry', body: [
        'Errors are classified as retryable (a timeout, a temporary failure) or not (a declined card). Only retryable ones are tried again, with the same key, so the processor sees the repeat and does not move money twice. Background repair jobs finish or reverse anything left in an unknown state [1].',
      ] },
    ],
    lessons: [
      'A timeout means unknown, not failed. Design for unknown.',
      'Make idempotency a shared library, not something each team reinvents.',
      'Classify errors before retrying them.',
    ],
    sources: [
      { title: 'Avoiding double payments in a distributed payments system', publisher: 'The Airbnb Tech Blog', year: 2019, url: 'https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb' },
    ],
  },
  {
    id: 'notion', company: 'Notion', challenge: 'co-notion',
    headline: 'How Notion sharded Postgres into 480 pieces',
    lede: 'Every paragraph, to-do and database row in Notion is a block, and the block table grew past what one Postgres could handle. Notion chose an unusual number of shards for a practical reason.',
    themes: ['Databases & sharding'],
    numbers: [
      { value: '480', label: 'logical shards (Postgres schemas)', src: 1 },
      { value: '32 → 96', label: 'physical databases, re-sharded with zero downtime', src: 2 },
    ],
    sections: [
      { title: 'Shard by workspace', body: [
        'Users work inside one workspace at a time, and pages rarely reference other workspaces. So the workspace ID became the partition key: all of a workspace\'s blocks live on the same shard and page loads never join across shards [1].',
        'Notion considered packaged solutions but chose application-level sharding: the application maps a workspace to one of 480 logical shards, and each logical shard to a physical database [1].',
      ] },
      { title: 'Why 480', body: [
        '480 divides evenly by a long list of numbers (2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 32 and more). That means the logical shards can be spread evenly over many different numbers of machines. The first layout was 32 databases with 15 shards each. In 2023 Notion moved to 96 databases with 5 each, using Postgres logical replication to copy data and switch over without downtime [1][2].',
      ] },
      { title: 'Pooling connections', body: [
        'Many app processes each holding connections to every database would exhaust Postgres. PgBouncer pools connections in between, and during the re-shard Notion had to shard the pooling layer as well [2].',
      ] },
    ],
    lessons: [
      'Pick a partition key that keeps everything one request needs together.',
      'Choose a shard count that divides evenly into many machine counts.',
      'Plan the next re-shard on day one; you will need it.',
    ],
    sources: [
      { title: 'Herding elephants: lessons learned from sharding Postgres at Notion', publisher: 'Notion Blog', year: 2021, url: 'https://www.notion.com/blog/sharding-postgres-at-notion' },
      { title: 'The great re-shard: adding Postgres capacity (again) with zero downtime', publisher: 'Notion Blog', year: 2023, url: 'https://www.notion.com/blog/the-great-re-shard' },
    ],
  },
  {
    id: 'pinterest', company: 'Pinterest', challenge: 'co-pinterest',
    headline: 'How Pinterest sharded MySQL and never moved data',
    lede: 'After painful experiences with databases that rebalanced themselves, Pinterest chose the most predictable design it could: a fixed set of MySQL shards, chosen up front, that data never leaves.',
    themes: ['Databases & sharding', 'Caching & CDN'],
    numbers: [
      { value: '4,096', label: 'shards opened at the start, with ID space for 65,536', src: 1 },
      { value: '8', label: 'physical servers at first, 512 databases on each', src: 1 },
    ],
    sections: [
      { title: 'The ID is the address', body: [
        'Every object ID is 64 bits holding a shard number, a type and a local auto-increment ID. Given any pin\'s ID, the code can compute which database holds it. A small configuration maps shard ranges to physical servers [1].',
        'New users are placed on a random shard, and their boards and pins are created on the same shard, so most of a user\'s data is together.',
      ] },
      { title: 'Boring on purpose', body: [
        'Data never moves between shards. When servers get full, shards are moved as whole databases to new machines, and new shard ranges are opened for new users. Each server is replicated to a standby for failover. A memcached layer in front absorbs the heavy read traffic [1].',
      ] },
    ],
    lessons: [
      'Predictable beats clever when you are on call.',
      'Open far more shards than you need, then grow by moving whole shards.',
      'Keep a user\'s data together so most queries touch one shard.',
    ],
    sources: [
      { title: 'Sharding Pinterest: how we scaled our MySQL fleet', publisher: 'Pinterest Engineering', year: 2015, url: 'https://medium.com/pinterest-engineering/sharding-pinterest-how-we-scaled-our-mysql-fleet-3f341e96ca6f' },
    ],
  },
  {
    id: 'lyft', company: 'Lyft', challenge: 'co-lyft',
    headline: 'How Lyft built Envoy and the service mesh',
    lede: 'Lyft\'s move to microservices made failures harder to understand: no one could tell which hop was slow. Its answer was a proxy beside every service, which became Envoy.',
    themes: ['Reliability'],
    numbers: [
      { value: '3–4 months', label: 'from empty files to the first production deploy', src: 1 },
      { value: '2016', label: 'all Lyft traffic routed through Envoy, then open-sourced', src: 1 },
      { value: '3rd', label: 'project to graduate from the CNCF, after Kubernetes and Prometheus', src: 3 },
    ],
    sections: [
      { title: 'The network as a problem', body: [
        'With dozens of services, every request crossed many network hops, and each service handled retries, timeouts and metrics differently, if at all. Developers stopped trusting the architecture because failures were hard to trace [2].',
      ] },
      { title: 'A proxy beside every service', body: [
        'Envoy began as Lyft\'s edge proxy, replacing HAProxy. It then moved next to every service as a sidecar: services talk to their local Envoy, which handles load balancing, retries with limits, circuit breaking and timeouts, and records consistent metrics for every hop [1][2].',
        'Because all traffic passes through the same software, observability became the biggest benefit: one dashboard can show where latency comes from.',
      ] },
    ],
    lessons: [
      'Put retries, timeouts and circuit breakers in one shared layer, not in every service.',
      'Bound retries. Unbounded retries turn a slow dependency into an outage.',
      'Observability is a feature of the network layer, not an afterthought.',
    ],
    sources: [
      { title: 'Matt Klein on Envoy (The Changelog #418)', publisher: 'The Changelog', year: 2020, url: 'https://changelog.com/podcast/418' },
      { title: 'Lyft\'s Envoy: embracing a service mesh', publisher: 'InfoQ', year: 2018, url: 'https://www.infoq.com/presentations/lyft-service-mesh' },
      { title: 'Envoy creator Matt Klein on CNCF graduation', publisher: 'InfoQ', year: 2020, url: 'https://www.infoq.com/news/2020/10/cncf-envoy-matt-klein/' },
    ],
  },
  {
    id: 'zoom', company: 'Zoom', challenge: 'co-zoom',
    headline: 'How Zoom routes video instead of mixing it',
    lede: 'In early 2020 daily Zoom meeting participants grew about thirtyfold in a few months. The architecture that absorbed it was built on forwarding streams rather than processing them.',
    themes: ['Real-time', 'Multi-region'],
    numbers: [
      { value: '10M → 300M', label: 'daily meeting participants, Dec 2019 to Apr 2020', src: 1 },
      { value: '19', label: 'data centers, plus public cloud capacity', src: 1 },
    ],
    sections: [
      { title: 'Routers, not mixers', body: [
        'Traditional conferencing used a multipoint control unit that decoded every participant\'s video, mixed it into one picture and encoded it again. That is heavy work per meeting. Zoom\'s multimedia routers forward streams between participants instead, and clients send several qualities so each receiver gets what its connection can handle [3].',
      ] },
      { title: 'Zones near people', body: [
        'Routers are grouped into meeting zones in data centers around the world. Zone controllers track the routers, and a global controller balances the zones. Participants are sent to the nearest data center and the least loaded router, and people in the same place can share a router. Two-person calls can even go peer to peer [2].',
        'New zones can be added on the fly, which is how capacity grew so quickly, including by adding public cloud capacity [1][2].',
      ] },
    ],
    lessons: [
      'Forwarding scales better than processing. Avoid work you can push to clients.',
      'Connect people to the nearest healthy capacity.',
      'Design units of capacity you can add on the fly.',
    ],
    sources: [
      { title: 'Q&A: Zoom CTO Brendan Ittelson', publisher: 'Streaming Media', year: 2021, url: 'https://www.streamingmedia.com/Articles/Editorial/Featured-Articles/QA-Zoom-CTO-Brendan-Ittelson-145024.aspx' },
      { title: 'Zoom: architected for reliability', publisher: 'Zoom Library', year: 2024, url: 'https://library.zoom.com/admin-corner/architecture-and-design/zoom-architected-for-reliability' },
      { title: 'Zoom Video Communications Form 10-K (FY2022)', publisher: 'SEC', year: 2022, url: 'https://www.sec.gov/Archives/edgar/data/1585521/000158552122000037/zm-20220131.htm' },
    ],
  },
]

export const findArticle = (id: string | undefined) => ARTICLES.find((a) => a.id === id)
export const articleForChallenge = (challengeId: string | null | undefined) => ARTICLES.find((a) => a.challenge === challengeId)
