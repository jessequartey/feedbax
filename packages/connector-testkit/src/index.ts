import {
  ChangelogPageSchema,
  ConnectorDescriptorSchema,
  FeedbackItemIdSchema,
  PublicCommentPageSchema,
  PublicCommentSchema,
  PublicFeedbackItemSchema,
  PublicFeedbackPageSchema,
  RoadmapPageSchema,
  SetVoteResultSchema,
  UnsupportedConnectorOperationError,
  UserIdSchema,
  VoteStateResponseSchema,
  type ConnectorRuntime,
  type PublicUser,
} from '@feedbax/core'
import { describe, expect, it } from 'vitest'

const viewer: PublicUser = {
  id: UserIdSchema.parse('contract-user'),
  displayName: 'Contract User',
}

export interface ConnectorContractFixture {
  readonly create: () => ConnectorRuntime | Promise<ConnectorRuntime>
  readonly feedbackItemId: string
  readonly changelogSlug?: string
  readonly unsupported?: readonly {
    readonly operation: 'createComment' | 'setSubscription'
    readonly capability: 'comments' | null
  }[]
}

/** Registers the connector-independent behavior every connector package must pass. */
export function connectorContract(
  name: string,
  fixture: ConnectorContractFixture,
) {
  describe(`${name} connector contract`, () => {
    const feedbackItemId = FeedbackItemIdSchema.parse(fixture.feedbackItemId)
    it('declares a valid connector with unique capabilities', async () => {
      const { descriptor } = await fixture.create()
      expect(ConnectorDescriptorSchema.parse(descriptor)).toEqual(descriptor)
      expect(new Set(descriptor.capabilities).size).toBe(
        descriptor.capabilities.length,
      )
    })

    it('returns canonical, internally consistent public reads', async () => {
      const { reader } = await fixture.create()
      PublicFeedbackPageSchema.parse(
        (await reader.listFeedback({ sort: 'newest' }, { pageSize: 20 })).value,
      )
      const item = PublicFeedbackItemSchema.parse(
        await reader.getFeedback(feedbackItemId),
      )
      expect(item).not.toHaveProperty('connector')
      expect(item.author).not.toHaveProperty('email')
      RoadmapPageSchema.parse(
        (await reader.listRoadmap({ pageSize: 20 })).value,
      )
      ChangelogPageSchema.parse(
        (await reader.listChangelog({ pageSize: 20 })).value,
      )
      PublicCommentPageSchema.parse(
        (await reader.listComments(item.id, { pageSize: 20 })).value,
      )
      if (fixture.changelogSlug)
        expect(
          await reader.getChangelogEntry(fixture.changelogSlug),
        ).not.toBeNull()
    })

    it('submits canonical feedback and treats vote state as idempotent', async () => {
      const { mutations } = await fixture.create()
      PublicFeedbackItemSchema.parse(
        await mutations.submit(
          {
            title: 'Contract fixture request',
            description: 'Synthetic connector contract content.',
            type: 'feature',
            tagIds: [],
          },
          viewer,
        ),
      )
      const first = SetVoteResultSchema.parse(
        await mutations.setVote(viewer.id, {
          feedbackItemId,
          voted: true,
        }),
      )
      const repeated = SetVoteResultSchema.parse(
        await mutations.setVote(viewer.id, {
          feedbackItemId,
          voted: true,
        }),
      )
      expect(repeated).toEqual(first)
      VoteStateResponseSchema.parse({
        items: await mutations.voteStates(viewer.id, [feedbackItemId]),
      })
      expect(
        await mutations.setVote(viewer.id, {
          feedbackItemId,
          voted: false,
        }),
      ).toMatchObject({ voted: false })
    })

    for (const unsupported of fixture.unsupported ?? [])
      it(`fails predictably for unsupported ${unsupported.operation}`, async () => {
        const runtime = await fixture.create()
        if (unsupported.capability)
          expect(runtime.descriptor.capabilities).not.toContain(
            unsupported.capability,
          )
        const call =
          unsupported.operation === 'createComment'
            ? runtime.mutations.createComment(viewer, 'customer', {
                clientRequestId: 'e81b17aa-f18c-4d1c-9990-319d0e5bd193',
                feedbackItemId,
                body: 'Synthetic contract comment.',
              })
            : runtime.mutations.setSubscription(
                {
                  target: { type: 'feedback', id: feedbackItemId },
                  subscribed: true,
                },
                viewer.id,
              )
        await expect(call).rejects.toBeInstanceOf(
          UnsupportedConnectorOperationError,
        )
      })
  })
}

export { UnsupportedConnectorOperationError, PublicCommentSchema }
