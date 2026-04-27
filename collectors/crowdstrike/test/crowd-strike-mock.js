process.env.AWS_REGION = 'us-east-1';
process.env.al_api = 'api.global-services.global.alertlogic.com';
process.env.ingest_api = 'ingest.global-services.global.alertlogic.com';
process.env.azcollect_api = 'azcollect.global-services.global.alertlogic.com';
process.env.collector_status_api = 'collector_status.global-services.global.alertlogic.com';
process.env.aims_access_key_id = 'aims-key-id';
process.env.aims_secret_key = 'aims-secret-key-encrypted';
process.env.log_group = 'logGroupName';
process.env.paws_state_queue_arn = "arn:aws:sqs:us-east-1:352283894008:paws-state-queue";
process.env.paws_extension = 'crowdstrike';
process.env.crowdstrike_endpoint = 'https://test.alertlogic.com/';
process.env.crowdstrike_token = 'crowdstrike-token';
process.env.collector_id = 'collector-id';
process.env.al_application_id = 'crowdstrike';
process.env.paws_secret_param_name = "crowdstrike-param-name";
process.env.paws_poll_interval = 60;
process.env.paws_type_name = "crowdstrike";
process.env.paws_api_client_id = "client-id";
process.env.paws_api_secret = "client-secret";
process.env.collector_streams = "[\"Alerts\"]";
process.env.paws_endpoint = "https://api.crowdstrike.com";

const AIMS_TEST_CREDS = {
    access_key_id: 'test-access-key-id',
    secret_key: 'test-secret-key'
};

const AUTHENTICATE = {
    "access_token": "test_token",
    "expires_in": 1799,
    "token_type": "bearer"
};

const LIST = {
    "meta" : {
        "query_time" : 0.01414002,
        "pagination" : {
            "offset" : 0,
            "limit" : 100,
            "total" : 3184
        },
        "powered_by" : "msa-api",
        "trace_id" : "d4d3158c-731c-4cb6-97ed-8b999f65fedf"
    },
    "resources" : ['ldt:4c3db6145a704a179a6dacd924f6e8cc:73087931424', 'ldt:4c3db6145a704a179a6dacd924f6e8cc:73087626831'],
    "errors" : []
};

const ALERTS_LOG_EVENT = {
    "meta": {
        "query_time": 0.01414002,
        "powered_by": "msa-api",
        "trace_id": "d4d3158c-731c-4cb6-97ed-8b999f65fedf"
    },
    "resources": [
        {
            "agent_id": "36f66221fa044c74a9e3ffa5ba8ab2d3",
            "aggregate_id": "806b5e44b7bce1006b1704c86c42f6f3813367dca081ba24ed1572",
            "composite_id": "fa23ab2e36fc4d12930f404ce0070d52:ind:36f66221fa044c74a9e3ffa5ba8ab2d3:4369786211892-10335-11200272",
            "context_timestamp": "2025-08-17T15:31:37.962Z",
            "crawled_timestamp": "2025-08-17T16:31:41.180070674Z",
            "created_timestamp": "2025-08-17T15:32:41.196001085Z",
            "show_in_ui": false,
            "confidence": 80,
            "severity": 70,
            "severity_name": "High",
            "status": "new",
            "product": "epp",
        }
    ],
    "errors": []
};


const FUNCTION_ARN = 'arn:aws:lambda:us-east-1:352283894008:function:test-01-CollectLambdaFunction-2CWNLPPW5XO8';
const FUNCTION_NAME = 'test-TestCollectLambdaFunction-1JNNKQIPOTEST';

module.exports = {
    AIMS_TEST_CREDS: AIMS_TEST_CREDS,
    FUNCTION_ARN: FUNCTION_ARN,
    FUNCTION_NAME: FUNCTION_NAME,
    ALERTS_LOG_EVENT: ALERTS_LOG_EVENT,
    LIST: LIST,
    AUTHENTICATE: AUTHENTICATE
};
