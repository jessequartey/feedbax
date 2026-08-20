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

**Feedback Item**:
A submission describing one proposed capability, defect, or product observation.
_Avoid_: Feature, ticket, post

**Feature Request**:
A Feedback Item proposing a capability the product does not currently provide.
_Avoid_: Feature, idea

**Bug Report**:
A Feedback Item describing existing product behavior that does not work as intended.
_Avoid_: Issue, defect

**General Feedback**:
A Feedback Item containing a product observation that is neither a Feature Request nor a Bug Report.
_Avoid_: Improvement, question, other

**Feedback Status**:
The lifecycle classification of a Feedback Item: New, Reviewing, Planned, In Progress, Shipped, or Closed.
_Avoid_: Stage, state

**Published Feedback Item**:
A Feedback Item a Team Member has approved for public display. Publication is independent of Feedback Status.
_Avoid_: Public status, approved feedback

**Browser Capability**:
A secret held by the submitting browser that permits limited changes to a New, unpublished Feedback Item. It is not a Participant identity or proof of email ownership.
_Avoid_: Account, session, verified owner

**Feedback Data Source**:
The Notion data source that holds a Product Team's Feedback Items using the Feedbax schema.
_Avoid_: Arbitrary database, CRM

## Editions

**Core**:
The complete, self-hostable open-source Feedbax product available under Apache-2.0.
_Avoid_: Community edition, free tier

**Feedbax Cloud**:
The future proprietary managed offering that operates exact released versions of Core and adds hosted capabilities.
_Avoid_: Premium folder, enterprise edition
