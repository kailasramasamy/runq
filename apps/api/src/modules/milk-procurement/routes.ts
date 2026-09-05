import { FastifyPluginAsync } from 'fastify';
import {
  createVmccSchema, updateVmccSchema,
  createChillingCentreSchema, updateChillingCentreSchema,
  createProcessingPlantSchema, updateProcessingPlantSchema,
} from '@runq/validators';
import { nodeRoutes } from './node.routes';
import { typedNodeRoutes } from './typed-node.routes';
import { farmerRoutes } from './farmer.routes';
import { rateChartRoutes } from './rate-chart.routes';
import { qualityBandRoutes } from './quality-band.routes';
import { pourRoutes } from './pour.routes';
import { shiftClosureRoutes } from './shift-closure.routes';
import { consignmentRoutes } from './consignment.routes';
import { qcTestRoutes } from './qc-test.routes';
import { rejectionRoutes } from './rejection.routes';
import { payoutRoutes } from './payout.routes';
import { farmerSaleRoutes } from './farmer-sale.routes';
import { operatorRoutes } from './operator.routes';
import { operatorPayoutRoutes } from './operator-payout.routes';
import { billingRoutes } from './billing.routes';
import { configRoutes } from './config.routes';
import { reportRoutes } from './report.routes';
import { accountRoutes } from './account.routes';
import { appAccessRoutes } from './app-access.routes';

/**
 * Dhenu milk-procurement module. Mounted at /api/v1/milk-procurement behind the
 * `milk_procurement` module-access gate. Spec: docs/dhenu-schema-spec.md.
 *
 * Shipped: collection-network nodes (VMCC/CC/PP) + farmer master.
 * Next: rate charts + the pour-capture path.
 */
export const milkProcurementRoutes: FastifyPluginAsync = async (app) => {
  // Shared read surface for all node types.
  await app.register(nodeRoutes, { prefix: '/nodes' });
  // Type-specific write surfaces (create / update / deactivate).
  await app.register(typedNodeRoutes('vmcc', createVmccSchema, updateVmccSchema), { prefix: '/vmccs' });
  await app.register(typedNodeRoutes('cc', createChillingCentreSchema, updateChillingCentreSchema), { prefix: '/chilling-centres' });
  await app.register(typedNodeRoutes('pp', createProcessingPlantSchema, updateProcessingPlantSchema), { prefix: '/processing-plants' });
  await app.register(farmerRoutes, { prefix: '/farmers' });
  await app.register(rateChartRoutes, { prefix: '/rate-charts' });
  await app.register(qualityBandRoutes, { prefix: '/quality-bands' });
  await app.register(pourRoutes, { prefix: '/pours' });
  await app.register(shiftClosureRoutes, { prefix: '/shifts' });
  await app.register(consignmentRoutes, { prefix: '/consignments' });
  await app.register(qcTestRoutes, { prefix: '/qc-tests' });
  // Milk refused for quality — recorded beside the pour/receipt, not erased.
  await app.register(rejectionRoutes, { prefix: '/rejections' });
  await app.register(payoutRoutes, { prefix: '/payouts' });
  // Milk sold back to a trader-farmer, netted off their next payout.
  await app.register(farmerSaleRoutes, { prefix: '/farmer-sales' });
  await app.register(operatorRoutes, { prefix: '/operators' });
  await app.register(operatorPayoutRoutes, { prefix: '/operator-payouts' });
  await app.register(billingRoutes, { prefix: '/billing' });
  await app.register(configRoutes, { prefix: '/config' });
  await app.register(reportRoutes, { prefix: '/reports' });
  // Self-serve account deletion (farmer / field operator).
  await app.register(accountRoutes, { prefix: '/account' });
  // Who may sign in to the Dhenu app (web Settings → Users toggle).
  await app.register(appAccessRoutes, { prefix: '/app-access' });
};
