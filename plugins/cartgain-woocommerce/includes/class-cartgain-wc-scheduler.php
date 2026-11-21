<?php

if (!defined('ABSPATH')) {
    exit;
}

final class CartGain_WC_Scheduler
{
    private $hooks = array(
        'cartgain_wc_process_queue' => 60,
        'cartgain_wc_inactivity_check' => 300,
        'cartgain_wc_full_sync' => 86400,
        'cartgain_wc_cleanup' => 86400,
    );

    public function has_action_scheduler()
    {
        return function_exists('as_schedule_single_action') && function_exists('as_has_scheduled_action');
    }

    public function schedule_recurring()
    {
        foreach ($this->hooks as $hook => $interval) {
            if ($this->has_action_scheduler()) {
                if (!as_has_scheduled_action($hook, array(), 'cartgain')) {
                    as_schedule_recurring_action(time() + $interval, $interval, $hook, array(), 'cartgain');
                }
                continue;
            }
            if (!wp_next_scheduled($hook)) {
                wp_schedule_event(time() + $interval, $this->interval_name($interval), $hook);
            }
        }
    }

    public function unschedule_all()
    {
        if (function_exists('as_unschedule_all_actions')) {
            foreach (array_keys($this->hooks) as $hook) {
                as_unschedule_all_actions($hook, array(), 'cartgain');
            }
        }
        foreach (array_keys($this->hooks) as $hook) {
            wp_clear_scheduled_hook($hook);
        }
    }

    public function schedule_single($hook, $args = array(), $delay = 10)
    {
        $args = is_array($args) ? $args : array();
        $key = 'cgw_sched_' . md5($hook . '|' . cartgain_wc_json_encode($args));
        if (get_transient($key)) {
            return false;
        }
        set_transient($key, 1, max(5, (int) $delay));

        if ($this->has_action_scheduler()) {
            as_schedule_single_action(time() + (int) $delay, $hook, $args, 'cartgain');
            return true;
        }
        if (!wp_next_scheduled($hook, $args)) {
            wp_schedule_single_event(time() + (int) $delay, $hook, $args);
        }
        return true;
    }

    public function next_run($hook)
    {
        if ($this->has_action_scheduler() && function_exists('as_next_scheduled_action')) {
            $next = as_next_scheduled_action($hook, array(), 'cartgain');
            if ($next) {
                return (int) $next;
            }
        }
        return (int) wp_next_scheduled($hook);
    }

    public function uses_action_scheduler()
    {
        return $this->has_action_scheduler();
    }

    private function interval_name($interval)
    {
        if ($interval === 60) {
            return 'cartgain_every_minute';
        }
        if ($interval === 300) {
            return 'cartgain_every_five_minutes';
        }
        return 'daily';
    }
}
