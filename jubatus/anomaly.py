#!/usr/bin/env python
# -*- coding: utf-8 -*-

import signal
import sys, json
from jubatus.anomaly import client
from jubatus.common import Datum

NAME = "anom_kddcup";

# handle keyboard interruption"
def do_exit(sig, stack):
    print('You pressed Ctrl+C.')
    print('Stop running the job.')
    sys.exit(0)

if __name__ == '__main__':
    # 0. set KeyboardInterrupt handler
    signal.signal(signal.SIGINT, do_exit)

    # 1. set jubatus server
    anom = client.Anomaly("127.0.0.1", 9199, NAME)

    # 2. prepare training data
    with open('kddcup.data_10_percent.txt', mode='r') as file:
        for line in file:
            duration, protocol_type, service, flag, src_bytes, dst_bytes, land, wrong_fragment, urgent, hot, num_failed_logins, logged_in, num_compromised, root_shell, su_attempted, num_root, num_file_creations, num_shells, num_access_files, num_outbound_cmds, is_host_login, is_guest_login, count, srv_count, serror_rate, srv_serror_rate, rerror_rate, srv_rerror_rate, same_srv_rate, diff_srv_rate, srv_diff_host_rate, dst_host_count, dst_host_srv_count, dst_host_same_srv_rate, dst_host_diff_srv_rate, dst_host_same_src_port_rate, dst_host_srv_diff_host_rate, dst_host_serror_rate, dst_host_srv_serror_rate, dst_host_rerror_rate, dst_host_srv_rerror_rate, label = line[:-1].split(",")

            datum = Datum()
            for (k, v) in [
                    ["protocol_type", protocol_type],
                    ["service", service],
                    ["flag", flag],
                    ["land", land],
                    ["logged_in", logged_in],
                    ["is_host_login", is_host_login],
                    ["is_guest_login", is_guest_login],
                    ]:
                datum.add_string(k, v)

            for (k, v) in [
                    ["duration",float(duration)],
                    ["src_bytes", float(src_bytes)],
                    ["dst_bytes", float(dst_bytes)],
                    ["wrong_fragment", float(wrong_fragment)],
                    ["urgent", float(urgent)],
                    ["hot", float(hot)],
                    ["num_failed_logins", float(num_failed_logins)],
                    ["num_compromised", float(num_compromised)],
                    ["root_shell", float(root_shell)],
                    ["su_attempted", float(su_attempted)],
                    ["num_root", float(num_root)],
                    ["num_file_creations", float(num_file_creations)],
                    ["num_shells", float(num_shells)],
                    ["num_access_files", float(num_access_files)],
                    ["num_outbound_cmds",float(num_outbound_cmds)],
                    ["count", float(count)],
                    ["srv_count",float(srv_count)],
                    ["serror_rate", float(serror_rate)],
                    ["srv_serror_rate", float(srv_serror_rate)],
                    ["rerror_rate", float(rerror_rate)],
                    ["srv_rerror_rate",float( srv_rerror_rate)],
                    ["same_srv_rate", float(same_srv_rate)],
                    ["diff_srv_rate", float(diff_srv_rate)],
                    ["srv_diff_host_rate", float(srv_diff_host_rate)],
                    ["dst_host_count",float( dst_host_count)],
                    ["dst_host_srv_count", float(dst_host_srv_count)],
                    ["dst_host_same_srv_rate",float( dst_host_same_srv_rate)],
                    ["dst_host_same_src_port_rate",float( dst_host_same_src_port_rate)],
                    ["dst_host_diff_srv_rate", float(dst_host_diff_srv_rate)],
                    ["dst_host_srv_diff_host_rate",float(dst_host_srv_diff_host_rate)],
                    ["dst_host_serror_rate",float(dst_host_serror_rate)],
                    ["dst_host_srv_serror_rate",float(dst_host_srv_serror_rate)],
                    ["dst_host_rerror_rate",float(dst_host_rerror_rate)],
                    ["dst_host_srv_rerror_rate",float(dst_host_srv_rerror_rate)],
                    ]:
                datum.add_number(k, v)

            # 3. train data and update jubatus model
            ret = anom.add(datum)

            # 4. output results
            if (ret.score != float('Inf')) and (ret.score!= 1.0):
                print (ret, label)
