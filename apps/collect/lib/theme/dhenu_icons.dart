import 'package:flutter_lucide/flutter_lucide.dart';

/// Dhenu's line-icon set — semantic names mapped to Lucide glyphs (1.75px
/// stroke, round caps), per the farmer redesign handoff. Screens reference
/// `DhenuIcons.<name>` so the icon vocabulary is centralised and emoji never
/// reappear. Render at the design's weight via `Icon(DhenuIcons.x, size: …)`.
abstract final class DhenuIcons {
  // Bottom navigation
  static const home = LucideIcons.house;
  static const collections = LucideIcons.chart_column;
  static const payments = LucideIcons.wallet;
  static const services = LucideIcons.store;
  static const profile = LucideIcons.user;

  // Operator navigation (VMCC / CC / PP)
  static const collect = LucideIcons.circle_plus;
  static const receive = LucideIcons.inbox;
  static const dispatch = LucideIcons.truck;
  static const tankers = LucideIcons.truck;

  // Shift
  static const sun = LucideIcons.sun; // AM
  static const moon = LucideIcons.moon; // PM

  // Milk / quality
  static const drop = LucideIcons.droplet;
  static const milk = LucideIcons.milk;
  static const grid = LucideIcons.grid_3x3; // rate matrix
  static const beaker = LucideIcons.beaker; // top FAT

  // Rewards
  static const trophy = LucideIcons.trophy;
  static const medal = LucideIcons.medal;
  static const calendar = LucideIcons.calendar;
  static const flame = LucideIcons.flame; // streak
  static const star = LucideIcons.star;
  static const userPlus = LucideIcons.user_plus; // referrer
  static const share = LucideIcons.share_2;
  static const download = LucideIcons.download;
  static const plusCircle = LucideIcons.circle_plus; // bonuses

  // Chrome / actions
  static const bell = LucideIcons.bell;
  static const bellDot = LucideIcons.bell_dot;
  static const listen = LucideIcons.volume_2;
  static const chevronLeft = LucideIcons.chevron_left;
  static const chevronRight = LucideIcons.chevron_right;
  static const refresh = LucideIcons.refresh_cw;
  static const warning = LucideIcons.triangle_alert;
  static const flag = LucideIcons.flag;
  static const transit = LucideIcons.hourglass;

  // Profile settings
  static const bank = LucideIcons.landmark;
  static const language = LucideIcons.languages;
  static const help = LucideIcons.life_buoy;
  static const about = LucideIcons.info;
  static const logout = LucideIcons.log_out;
  static const shieldCheck = LucideIcons.shield_check;

  // Services
  static const feed = LucideIcons.wheat;
  static const vet = LucideIcons.stethoscope;
  static const insurance = LucideIcons.shield;
  static const loans = LucideIcons.hand_coins;

  // Status / feedback
  static const history = LucideIcons.history;
  static const cloudOff = LucideIcons.cloud_off;
  static const cloud = LucideIcons.cloud;
  static const checkCircle = LucideIcons.circle_check;
  static const check = LucideIcons.check;
  static const error = LucideIcons.circle_alert;
  static const info = LucideIcons.info;

  // Common actions
  static const search = LucideIcons.search;
  static const searchOff = LucideIcons.search_x;
  static const edit = LucideIcons.pencil;
  static const add = LucideIcons.plus;
  static const close = LucideIcons.x;
  static const upload = LucideIcons.upload;
  static const trash = LucideIcons.trash_2;
  static const filterOff = LucideIcons.funnel_x;
  static const listAdd = LucideIcons.list_plus;
  static const minusCircle = LucideIcons.circle_minus;
  static const arrowRight = LucideIcons.arrow_right;
  static const chevronDown = LucideIcons.chevron_down;
  static const chevronUp = LucideIcons.chevron_up;

  // Entities / domain
  static const truck = LucideIcons.truck;
  static const plant = LucideIcons.factory;
  static const store = LucideIcons.store;
  static const snowflake = LucideIcons.snowflake;
  static const package = LucideIcons.package;
  static const user = LucideIcons.user;
  static const users = LucideIcons.users;
  static const userSearch = LucideIcons.user_search;
  static const userOff = LucideIcons.user_x;
  static const pets = LucideIcons.paw_print;
  static const phone = LucideIcons.phone;
  static const lock = LucideIcons.lock;
  static const mapPin = LucideIcons.map_pin;
  static const camera = LucideIcons.camera;
  static const images = LucideIcons.images;
  static const cake = LucideIcons.cake;
  static const idCard = LucideIcons.id_card;
  static const receipt = LucideIcons.receipt_text;
  static const document = LucideIcons.file_text;
  static const scale = LucideIcons.scale;
  static const clock = LucideIcons.clock;
  static const dashboard = LucideIcons.layout_dashboard;
  static const barChart = LucideIcons.chart_column;
  static const trendingUp = LucideIcons.trending_up;
  static const trendingDown = LucideIcons.trending_down;
  static const sunMoon = LucideIcons.sun_moon;
  static const circleUser = LucideIcons.circle_user;
  static const apple = LucideIcons.apple;
  static const outbound = LucideIcons.send;
  static const scanDoc = LucideIcons.file_scan;
}
