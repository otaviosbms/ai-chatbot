import { Field, GraphQLISODateTime, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class HealthStatus {
  @Field()
  status: string;

  @Field()
  database: string;

  @Field(() => GraphQLISODateTime)
  checkedAt: Date;
}
