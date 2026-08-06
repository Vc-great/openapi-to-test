import getUserHandler from "../scenarios/generators/generated/msw/users/get-user.handler.ts";
import { useGetUserQuery as useGetUserSWR } from "../scenarios/generators/generated/swr/users/use-get-user.query.ts";
import { useGetUserQuery } from "../scenarios/generators/generated/vue-query/users/use-get-user.query.ts";
import { getUserService } from "../scenarios/generators/generated/ts-request/users/get-user.service.ts";
import { userSchema } from "../scenarios/generators/generated/zod/zod/models/user.schema.ts";
import type { UserModel } from "../scenarios/generators/generated/ts-type/types/models/user.model.ts";

void getUserHandler;
void useGetUserSWR;
void useGetUserQuery;
void getUserService;
void userSchema;
const user: UserModel | undefined = undefined;
void user;
