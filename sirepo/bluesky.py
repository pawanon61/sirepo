# -*- coding: utf-8 -*-
u"""NSLS-II BlueSky integration

:copyright: Copyright (c) 2018 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkcollections
from pykern import pkconfig
from pykern.pkdebug import pkdp
from sirepo import util
from sirepo import simulation_db
import base64
import hashlib
import numconv
import random

cfg = None

_AUTH_NONCE_CHARS = numconv.BASE62

_AUTH_NONCE_LEN = 32

def auth_hash(req, verify=False):
    if not 'authNonce' in req:
        if verify:
           util.raise_not_found('authNonce: missing field in request')
        r = random.SystemRandom()
        req.authNonce = ''.join(
            r.choice(_AUTH_NONCE_CHARS) for x in range(_AUTH_NONCE_LEN)
        )
    h = hashlib.sha256()
    h.update(
        # POSIT: ':' not part of simulationType or simulationId
        ':'.join([
            req.authNonce,
            req.simulationType,
            req.simulationId,
            cfg.auth_secret,
        ]),
    )
    res = 'v1:' + base64.urlsafe_b64encode(h.digest())
    if not verify:
        req.authHash = res
        return
    if res != req.authHash:
        util.raise_not_found(
            '{}: hash mismatch expected={} nonce={}',
            req.authHash,
            res,
            req.authNonce,
        )


def auth_login(req):
    from sirepo import server

    if cfg.auth_secret:
        auth_hash(req, verify=True)
    # DEPRECATED
    elif not server.cfg.enable_bluesky:
        util.raise_not_found('bluesky is not enabled')
    sid = req.simulationId
    sim_type = req.simulationType
    path = simulation_db.find_global_simulation(
        sim_type,
        sid,
        checked=True,
    )
    server.session_user(simulation_db.uid_from_dir_name(path))
    return pkcollections.Dict(
        status='OK',
        data=simulation_db.open_json_file(sim_type, sid=sid),
    )


cfg = pkconfig.init(
    auth_secret=(None, str, 'Shared secret between Sirepo and BlueSky server'),
)
