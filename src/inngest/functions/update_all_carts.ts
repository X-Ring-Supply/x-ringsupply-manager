import { batchActionAsync } from "~/server/api/common";
import { getContactIds } from "~/server/db/query/coreforce";
import { inngest } from "../client";
import logInngestError from "./error_handling";
import { updateUserCartItems } from "./update_user_cart";
import { authorize } from "~/server/api/functions/cf_authorization";

export const updateAllCartItems = inngest.createFunction(
  {
    id: "updateAllCarts",
    name: "Update All User Carts",
    onFailure: logInngestError,
  },
  { event: "db/update.cart_items" },
  async ({ step }) => {
    const contacts = await step.run("fetch-db-contacts", async () => {
      return await getContactIds();
    });

    await step.run("authorize-api", async () => {
      const authResponse = await authorize();

      if (!authResponse.success) {
        throw new Error("Authorization failed: " + authResponse.error);
      }
    });

    const functions: Promise<{ countSynced: number }>[] = [];
    await batchActionAsync(
      contacts,
      async (contactBatch, index) => {
        functions.push(
          step.invoke("update-user-cart-items" + index, {
            function: updateUserCartItems,
            data: {
              contacts: contactBatch,
              checkAuth: false,
            },
          }),
        );
      },
      900,
    );

    const functionResults = await Promise.all(functions);
    const countSynced = functionResults.reduce(
      (sum, result) => sum + result.countSynced,
      0,
    );

    return { countSynced };
  },
);
