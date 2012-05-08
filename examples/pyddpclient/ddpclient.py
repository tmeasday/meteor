from ws4py.client.threadedclient import WebSocketClient

import sys
import json
from cmd import Cmd
import readline
import time
import string
import argparse

class DDPClient(WebSocketClient):
    def __init__(self, url, onmessage, print_raw):
        WebSocketClient.__init__(self, url)
        self.connected = False
        self.onmessage = onmessage
        self.print_raw = print_raw

    def print_and_send(self, msg_dict):
        message = json.dumps(msg_dict)
        if self.print_raw:
            print '[RAW] >>', message
        self.send(message)

    def opened(self):
        self.connected = True
        self.print_and_send({"msg": "connect"})

    def received_message(self, data):
        if self.print_raw:
            print '[RAW] <<', data
        self.onmessage(str(data))

    def closed(self, code, reason=None):
        self.connected = False
        print '* CONNECTION CLOSED', code, reason

class App(Cmd):
    """Main input loop."""

    def __init__(self, print_raw):
        Cmd.__init__(self)

        # Hide the prompt, because it makes the output messy when piping in
        # a file
        self.prompt = ''

        self.ddpclient = None
        self.uid = 0

        # Should we print the raw websocket messages in addition to parsing
        # them?
        self.print_raw = print_raw

        # We keep track of methods and subs that have been sent from the client
        # so that we only return to the prompt or quit the app once we get
        # back all the results from the server
        self.pending_method_id = None
        self.pending_method_result_acked = False
        self.pending_method_data_acked = False

        self.pending_sub_id = None
        self.pending_sub_data_acked = False

    ###
    ### The `connect` command
    ###
    def help_connect(self):
        print '\n'.join(['connect <websocket endpoint url>',
                         '  Connect to a DDP endpoint. For Meteor apps, the ' +
                         'url is something like ' +
                         '`http://foo.meteor.com/sockjs/websocket`'])

    def do_connect(self, url):
        self.ddpclient = DDPClient(url, self.onmessage, self.print_raw)
        self.ddpclient.connect()

    ###
    ### The `method` command
    ###
    def help_method(self):
        print '\n'.join(['method <method name> <json array of parameters>',
                         '  Calls a remote method',
                         '  Example: method createApp ' +
                         '[{"name": "foo.meteor.com", ' +
                         '"description": "bar"}]']);

    def do_method(self, params):
        split_params = string.split(params, ' ')
        method_name = split_params[0]
        params = json.loads(' '.join(split_params[1:]))

        if self.ensure_connected():
            id = self.next_id()
            self.ddpclient.print_and_send({"msg": "method",
                                           "method": method_name,
                                           "params": params,
                                           "id": id})
            self.block_until_method_fully_returns(id)

    def block_until_method_fully_returns(self, id):
        """Wait until the last call to method gets back all necessary data
        from the server"""
        self.pending_method_id = id
        while True:
            if self.pending_method_result_acked and self.pending_method_data_acked:
                self.pending_method_result_acked = False
                self.pending_method_data_acked = False
                self.pending_method_id = None
                return
            else:
                time.sleep(0)

    ###
    ### The `sub` command
    ###
    def help_sub(self):
        print '\n'.join(['sub <subscription name> <json array of parameters>',
                         '  Subscribes to a remote dataset',
                         '  Example: sub myApp ["foo.meteor.com"]'])

    def do_sub(self, params):
        split_params = string.split(params, ' ')
        sub_name = split_params[0]
        params = json.loads(' '.join(split_params[1:]))

        if self.ensure_connected():
            id = self.next_id()
            self.ddpclient.print_and_send({"msg": "sub",
                                           "name": sub_name,
                                           "params": params,
                                           "id": id})
            self.block_until_sub_fully_returns(id)

    def block_until_sub_fully_returns(self, id):
        """Wait until the last call to sub gets back all necessary data
        from the server"""
        self.pending_sub_id = id
        while True:
            if self.pending_sub_data_acked:
                self.pending_sub_data_acked = False
                self.pending_sub_id = None
                return
            else:
                time.sleep(0)

    ###
    ### The `EOF` "command" (to support `cat file | python ddpclient.py`)
    ###
    def do_EOF(self, line):
        return True

    ###
    ### Auxiliary methods
    ###
    def next_id(self):
        self.uid = self.uid + 1
        return str(self.uid)

    def onmessage(self, message):
        """Parse an incoming message, printing and updating the various
        pending_* attributes as appropriate"""

        map = json.loads(message)
        if map.get('msg') == 'connected':
            print "* CONNECTED"
        elif map.get('msg') == 'result':
            if map['id'] == self.pending_method_id:
                self.pending_method_result_acked = True
                print "* METHOD RESULT", map['result']
        elif map.get('msg') == 'data':
            if map.get('collection'):
                if map.get('set'):
                    for key, value in map['set'].items():
                        print "* SET", map['collection'], map['id'], key, value
                if map.get('unset'):
                    for key in map['unset']:
                        print "* UNSET", map['collection'], map['id'], key
            if map.get('methods'):
                if self.pending_method_id in map['methods']:
                    self.pending_method_data_acked = True
            if map.get('subs'):
                if self.pending_sub_id in map['subs']:
                    self.pending_sub_data_acked = True
                    print "* SUB COMPLETE"

    def ensure_connected(self):
        if self.ddpclient is None or not self.ddpclient.connected:
            print 'Connection closed. Use `connect` to establish one'
            return False
        else:
            return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='A command-line tool for communicating with a DDP server.')
    parser.add_argument('ddp_endpoint', metavar='ddp_endpoint', nargs='?',
                        help='DDP websocket endpoint to connect ' +
                        'to, e.g. http://foo.meteor.com/sockjs/websocket')
    parser.add_argument('--print_raw', dest='print_raw', action="store_true",
                        help='print raw websocket data in addition to parsed results')
    args = parser.parse_args()

    app = App(print_raw=args.print_raw)

    if args.ddp_endpoint:
        app.do_connect(args.ddp_endpoint)

    app.cmdloop()






