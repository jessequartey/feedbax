import { ParseResult, Schema } from 'effect'

const decodeOptions = { onExcessProperty: 'error' } as const

export interface RuntimeSchema<A, I = A> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly effect: Schema.Schema<any, any, never> | Schema.PropertySignature.All
  parse(input: unknown): A
  safeParse(
    input: unknown,
  ):
    | { readonly success: true; readonly data: A }
    | { readonly success: false; readonly error: RuntimeParseError }
  optional(): RuntimeSchema<A | undefined, I | undefined>
  nullable(): RuntimeSchema<A | null, I | null>
  default(value: A): RuntimeSchema<A, I | undefined>
  readonly(): RuntimeSchema<A, I>
  refine(
    predicate: (value: A) => boolean,
    options?: string | { readonly message?: string },
  ): RuntimeSchema<A, I>
}

export interface RuntimeParseIssue {
  readonly path: readonly PropertyKey[]
  readonly message: string
}

export interface RuntimeParseError {
  readonly cause: unknown
  readonly issues: readonly RuntimeParseIssue[]
  flatten(): {
    readonly fieldErrors: Readonly<Record<string, readonly string[]>>
  }
}

const runtimeParseError = (cause: unknown): RuntimeParseError => {
  const formatted = ParseResult.isParseError(cause)
    ? ParseResult.ArrayFormatter.formatIssueSync(cause.issue)
    : []
  const issues = formatted.length
    ? formatted.map(({ path, message }) => ({ path, message }))
    : [
        {
          path: [],
          message: cause instanceof Error ? cause.message : 'Invalid input',
        },
      ]
  return {
    cause,
    issues,
    flatten: () => {
      const fieldErrors: Record<string, string[]> = {}
      for (const issue of issues) {
        const field = issue.path[0]
        if (typeof field !== 'string') continue
        ;(fieldErrors[field] ??= []).push(issue.message)
      }
      return { fieldErrors }
    },
  }
}

// The heterogeneous shape boundary intentionally erases member types; mapped
// types recover each member's exact output and input immediately afterwards.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRuntimeSchema = RuntimeSchema<any, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypeOf<S> = S extends RuntimeSchema<infer A, any> ? A : never
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InputOf<S> = S extends RuntimeSchema<any, infer I> ? I : never

const wrap = <A, I>(
  effect: Schema.Schema<A, I, never>,
): RuntimeSchema<A, I> => {
  const schema: RuntimeSchema<A, I> = {
    effect,
    parse: (input) => Schema.decodeUnknownSync(effect)(input, decodeOptions),
    safeParse: (input) => {
      try {
        return {
          success: true as const,
          data: Schema.decodeUnknownSync(effect)(input, decodeOptions),
        }
      } catch (error) {
        return { success: false as const, error: runtimeParseError(error) }
      }
    },
    optional: () =>
      wrap(Schema.UndefinedOr(effect)) as RuntimeSchema<
        A | undefined,
        I | undefined
      >,
    nullable: () =>
      wrap(Schema.NullOr(effect)) as RuntimeSchema<A | null, I | null>,
    default: (value) => {
      const encodedDefault = Schema.encodeSync(effect)(value)
      return wrap(
        Schema.transform(Schema.Unknown, effect, {
          strict: true,
          decode: (input) =>
            input === undefined ? encodedDefault : (input as I),
          encode: (output) => output,
        }) as unknown as Schema.Schema<A, I | undefined, never>,
      )
    },
    readonly: () => schema,
    refine: (predicate, options) =>
      wrap(
        effect.pipe(
          Schema.filter(predicate, {
            message: () =>
              typeof options === 'string'
                ? options
                : (options?.message ?? 'Refinement failed'),
          }),
        ),
      ),
  }
  return schema
}

export interface StringRuntimeSchema<
  A extends string = string,
  I = string,
> extends RuntimeSchema<A, I> {
  trim(): StringRuntimeSchema<A, I>
  min(length: number): StringRuntimeSchema<A, I>
  max(length: number): StringRuntimeSchema<A, I>
  regex(pattern: RegExp): StringRuntimeSchema<A, I>
  brand<Name extends string>(
    name: Name,
  ): RuntimeSchema<A & { readonly [K in Name]: Name }, I>
}

const stringWrap = <A extends string = string, I = string>(
  effect: Schema.Schema<A, I, never>,
): StringRuntimeSchema<A, I> => {
  const base = wrap(effect)
  return Object.assign(base, {
    trim: () =>
      stringWrap(
        Schema.Trim.pipe(
          Schema.compose(effect as unknown as Schema.Schema<A, string, never>),
        ) as unknown as Schema.Schema<A, I>,
      ),
    min: (length: number) =>
      stringWrap(effect.pipe(Schema.minLength(length)) as Schema.Schema<A, I>),
    max: (length: number) =>
      stringWrap(effect.pipe(Schema.maxLength(length)) as Schema.Schema<A, I>),
    regex: (pattern: RegExp) =>
      stringWrap(effect.pipe(Schema.pattern(pattern)) as Schema.Schema<A, I>),
    brand: <Name extends string>(name: Name) =>
      wrap(effect.pipe(Schema.brand(name))) as unknown as RuntimeSchema<
        A & { readonly [K in Name]: Name },
        I
      >,
  }) as unknown as StringRuntimeSchema<A, I>
}

export interface NumberRuntimeSchema extends RuntimeSchema<number> {
  int(): NumberRuntimeSchema
  nonnegative(): NumberRuntimeSchema
  positive(): NumberRuntimeSchema
  min(value: number): NumberRuntimeSchema
  max(value: number): NumberRuntimeSchema
}

const numberWrap = (effect: Schema.Schema<number>): NumberRuntimeSchema => {
  const base = wrap(effect)
  return Object.assign(base, {
    int: () => numberWrap(effect.pipe(Schema.int())),
    nonnegative: () => numberWrap(effect.pipe(Schema.nonNegative())),
    positive: () => numberWrap(effect.pipe(Schema.positive())),
    min: (value: number) =>
      numberWrap(effect.pipe(Schema.greaterThanOrEqualTo(value))),
    max: (value: number) =>
      numberWrap(effect.pipe(Schema.lessThanOrEqualTo(value))),
  }) as unknown as NumberRuntimeSchema
}

export interface ArrayRuntimeSchema<A, I> extends RuntimeSchema<
  readonly A[],
  readonly I[]
> {
  min(length: number): ArrayRuntimeSchema<A, I>
  max(length: number): ArrayRuntimeSchema<A, I>
}

const constrainedArrayWrap = <A, I>(
  effect: Schema.Schema<readonly A[], readonly I[], never>,
): ArrayRuntimeSchema<A, I> => {
  const base = wrap(effect)
  return Object.assign(base, {
    min: (length: number) =>
      constrainedArrayWrap(effect.pipe(Schema.minItems(length))),
    max: (length: number) =>
      constrainedArrayWrap(effect.pipe(Schema.maxItems(length))),
  }) as unknown as ArrayRuntimeSchema<A, I>
}

const arrayWrap = <A, I>(item: Schema.Schema<A, I, never>) =>
  constrainedArrayWrap(Schema.Array(item))

export type Shape = Readonly<Record<string, AnyRuntimeSchema>>
type OptionalTypeKeys<S extends Shape> = {
  [K in keyof S]: undefined extends TypeOf<S[K]> ? K : never
}[keyof S]
type OptionalInputKeys<S extends Shape> = {
  [K in keyof S]: undefined extends InputOf<S[K]> ? K : never
}[keyof S]
type StructType<S extends Shape> = {
  [K in Exclude<keyof S, OptionalTypeKeys<S>>]: TypeOf<S[K]>
} & {
  [K in OptionalTypeKeys<S>]?: Exclude<TypeOf<S[K]>, undefined>
}
type StructInput<S extends Shape> = {
  readonly [K in Exclude<keyof S, OptionalInputKeys<S>>]: InputOf<S[K]>
} & {
  readonly [K in OptionalInputKeys<S>]?: Exclude<InputOf<S[K]>, undefined>
}

export interface ObjectRuntimeSchema<S extends Shape> extends RuntimeSchema<
  StructType<S>,
  StructInput<S>
> {
  readonly shape: S
  extend<E extends Shape>(extra: E): ObjectRuntimeSchema<S & E>
  superRefine(
    check: (
      value: StructType<S>,
      context: {
        addIssue(issue: {
          readonly message: string
          readonly path?: readonly PropertyKey[]
          readonly code?: unknown
        }): void
      },
    ) => void,
  ): RuntimeSchema<StructType<S>, StructInput<S>>
}

const objectWrap = <S extends Shape>(shape: S): ObjectRuntimeSchema<S> => {
  const fields = Object.fromEntries(
    Object.entries(shape).map(([key, value]) => [key, value.effect]),
  ) as { [K in keyof S]: S[K]['effect'] }
  const effect = Schema.Struct(fields) as unknown as Schema.Schema<
    StructType<S>,
    StructInput<S>
  >
  const base = wrap(effect)
  return Object.assign(base, {
    shape,
    extend: <E extends Shape>(extra: E) =>
      objectWrap({ ...shape, ...extra } as S & E),
    superRefine: (
      check: (
        value: StructType<S>,
        context: {
          addIssue(issue: {
            readonly message: string
            readonly path?: readonly PropertyKey[]
            readonly code?: unknown
          }): void
        },
      ) => void,
    ) =>
      wrap(
        effect.pipe(
          Schema.filter((value) => {
            const issues: Array<{
              readonly message: string
              readonly path?: readonly PropertyKey[]
            }> = []
            check(value, { addIssue: (issue) => issues.push(issue) })
            return issues.length === 0
              ? true
              : issues.map(({ message, path = [] }) => ({ message, path }))
          }),
        ),
      ),
  }) as unknown as ObjectRuntimeSchema<S>
}

const checkedString = (
  predicate: (value: string) => boolean,
  message: string,
) =>
  stringWrap(
    Schema.String.pipe(Schema.filter(predicate, { message: () => message })),
  )

export const z = {
  string: () => stringWrap(Schema.String),
  number: () => numberWrap(Schema.Number),
  boolean: () => wrap(Schema.Boolean),
  unknown: () => wrap(Schema.Unknown),
  literal: <const A extends string | number | boolean>(value: A) =>
    wrap(Schema.Literal(value)),
  enum: <const A extends readonly [string, ...string[]] | readonly string[]>(
    values: A,
  ) => wrap(Schema.Literal(...values)) as RuntimeSchema<A[number]>,
  array: <A, I>(item: RuntimeSchema<A, I>) =>
    arrayWrap(item.effect as Schema.Schema<A, I, never>),
  strictObject: <S extends Shape>(shape: S) => objectWrap(shape),
  url: () =>
    checkedString((value) => {
      try {
        new URL(value)
        return true
      } catch {
        return false
      }
    }, 'Expected a URL'),
  email: () =>
    checkedString(
      (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      'Expected an email',
    ),
  uuid: () =>
    checkedString(
      (value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        ),
      'Expected a UUID',
    ),
  iso: {
    datetime: (
      ...args: readonly [{ readonly offset?: boolean }] | readonly []
    ) => {
      const allowNumericOffset = args[0]?.offset !== false
      const pattern = allowNumericOffset
        ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
        : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
      return checkedString(
        (value) => pattern.test(value) && !Number.isNaN(Date.parse(value)),
        'Expected an ISO date-time with offset',
      )
    },
  },
}

// The namespace supplies the established `z.infer` type spelling while the
// runtime value above is entirely backed by Effect Schema.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace z {
  export type infer<S extends AnyRuntimeSchema> = TypeOf<S>
}
