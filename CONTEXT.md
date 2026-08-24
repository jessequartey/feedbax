# Feedbax Feedback Management

Feedbax helps small product teams involve their users in product development while keeping the team's feedback workflow in Notion.

## Language

**Product Team**:
The organization operating a feedback portal for one of its products.
_Avoid_: Customer, account, tenant

**Team Member**:
A person belonging to the Product Team who triages feedback and plans product work.
_Avoid_: Admin, staff user

**Participant**:
A product user who submits feedback or participates through voting, commenting, or following updates.
_Avoid_: End user, customer, visitor

**Deployer**:
The technical person who installs and configures Feedbax for a Product Team. A Deployer may also be a Team Member.
_Avoid_: Installer, operator

**Installation**:
A deployed instance of Feedbax serving one Product Team and one product.
_Avoid_: Tenant, account

**Notion Workspace**:
The Product Team's Notion environment containing its feedback content and product-planning data.
_Avoid_: CRM

**Notion-only Profile**:
A basic Feedbax capability profile for public feedback browsing and submission without verified Participant identity or social interactions.
_Avoid_: Lite mode, anonymous identity

**Connected Profile**:
A Feedbax capability profile that adds verified Participant identity, voting, commenting, following, notifications, and signed identity handoff.
_Avoid_: Full mode, premium mode

## Feedback

**Post**:
A submission describing one proposed capability, defect, or product observation in the feedback portal.
_Avoid_: Feedback Item, feature, ticket

**Feature Request**:
A Post proposing a capability the product does not currently provide.
_Avoid_: Feature, idea

**Bug Report**:
A Post describing existing product behavior that does not work as intended.
_Avoid_: Issue, defect

**General Feedback**:
A Post containing a product observation that is neither a Feature Request nor a Bug Report.
_Avoid_: Improvement, question, other

**Post Status**:
The lifecycle classification of a Post: New, Reviewing, Planned, In Progress, Shipped, or Closed.
_Avoid_: Stage, state

**Published Post**:
A Post a Team Member has approved for public display. Publication is independent of Post Status.
_Avoid_: Public status, approved post

**Draft Post**:
A New, unpublished Post that may be edited from a browser holding its Browser Capability.
_Avoid_: Owned Post, private Post, user Post

**Browser Capability**:
A secret held by the submitting browser that permits limited changes to a New, unpublished Post. It is not a Participant identity or proof of email ownership.
_Avoid_: Account, session, verified owner

**Device Profile**:
Optional Participant details stored in one browser and attached privately to new Post submissions. A Device Profile is not verified identity, an account, or editing authority.
_Avoid_: Account, sign-in, user profile

**Feedback Data Source**:
The Notion data source that holds a Product Team's Posts using the Feedbax schema.
_Avoid_: Arbitrary database, CRM

**Board**:
A public, named view that filters Posts by Post Type. "All posts" is the Board that applies no Post Type filter. A Board is a filter view, not an independent entity, and holds no settings of its own.
_Avoid_: Category, section, forum, group

## Changelog

**Changelog Entry**:
A published record of a product update shown on the Changelog page: date, title, summary, body, optional image, and Changelog Labels.
_Avoid_: Post (reserved for feedback), announcement, blog post

**Changelog Label**:
A category tag a Product Team assigns to a Changelog Entry, such as "New feature", "Improved", or "Fix". The label set is open and independent of Post Status.
_Avoid_: Status, tag, category

## Editions

**Core**:
The complete, self-hostable open-source Feedbax product available under Apache-2.0.
_Avoid_: Community edition, free tier

**Feedbax Cloud**:
The future proprietary managed offering that operates exact released versions of Core and adds hosted capabilities.
_Avoid_: Premium folder, enterprise edition
