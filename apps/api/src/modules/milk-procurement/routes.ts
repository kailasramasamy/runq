import { FastifyPluginAsync } from 'fastify';
import { nodeRoutes } from './node.routes';
import { farmerRoutes } from './farmer.routes';
import { rateChartRoutes } from './rate-chart.routes';
import { pourRoutes } from './pour.routes';
import { consignmentRoutes } from './consignment.routes';
import { qcTestRoutes } from './qc-test.routes';
import { payoutRoutes } from './payout.routes';
import { operatorRoutes } from './operator.routes';
import { operatorPayoutRoutes } from './operator-payout.routes';
import { configRoutes } from './config.routes';
import { reportRoutes } from './report.routes';

/**
 * Dhenu milk-procurement module. Mounted at /api/v1/milk-procurement behind the
 * `milk_procurement` module-access gate. Spec: docs/dhenu-schema-spec.md.
 *
 * Shipped: collection-network nodes (VMCC/CC/PP) + farmer master.
 * Next: rate charts + the pour-capture path.
 */
export const milkProcurementRoutes: FastifyPluginAsync = async (app) => {
  await app.register(nodeRoutes, { prefix: '/nodes' });
  await app.register(farmerRoutes, { prefix: '/farmers' });
  await app.register(rateChartRoutes, { prefix: '/rate-charts' });
  await app.register(pourRoutes, { prefix: '/pours' });
  await app.register(consignmentRoutes, { prefix: '/consignments' });
  await app.register(qcTestRoutes, { prefix: '/qc-tests' });
  await app.register(payoutRoutes, { prefix: '/payouts' });
  await app.register(operatorRoutes, { prefix: '/operators' });
  await app.register(operatorPayoutRoutes, { prefix: '/operator-payouts' });
  await app.register(configRoutes, { prefix: '/config' });
  await app.register(reportRoutes, { prefix: '/reports' });
};
