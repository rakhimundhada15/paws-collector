/* -----------------------------------------------------------------------------
 * @copyright (C) 2019, Alert Logic, Inc
 * @doc
 *
 * Lambda function for polling 3rd party service log API and ingest retrieved data
 * into Alert Logic backend.
 *
 * @end
 * -----------------------------------------------------------------------------
 */
'use strict';

const async = require('async');
const debug = require('debug')('index');
const AWS = require('aws-sdk');
const fs = require('fs');
const moment = require('moment');
const ddLambda = require('datadog-lambda-js');

const AlAwsCollector = require('@alertlogic/al-aws-collector-js').AlAwsCollector;
const packageJson = require('./package.json');

const CREDS_FILE_PATH = '/tmp/paws_creds';
var PAWS_DECRYPTED_CREDS = null;
const DOMAIN_REGEXP = /^[htps]*:\/\/|\/$/gi;

function getPawsParamStoreParam(){
    return new Promise((resolve, reject) => {
        if(fs.existsSync(CREDS_FILE_PATH)){
            return resolve(fs.readFileSync(CREDS_FILE_PATH));
        }
        var ssm = new AWS.SSM();
        var params = {
            Name: process.env.paws_secret_param_name
        };
        ssm.getParameter(params, function(err, res) {
            if(err){
                reject(err, err.stack);
            } else{
                const {Parameter:{Value}} = res;
                const data = Buffer.from(Value, 'base64');
                fs.writeFileSync(CREDS_FILE_PATH, data, 'base64');
                resolve(data);
            }
        });
    });
}

function getDecryptedPawsCredentials(credsBuffer) {
    return new Promise((resolve, reject) => {
        if (PAWS_DECRYPTED_CREDS) {
            return resolve(PAWS_DECRYPTED_CREDS);
        } else {
            const kms = new AWS.KMS();
            kms.decrypt(
                {CiphertextBlob: credsBuffer},
                (err, data) => {
                    if (err) {
                        return reject(err);
                    } else {
                        PAWS_DECRYPTED_CREDS = {
                            auth_type: process.env.paws_api_auth_type,
                            client_id: process.env.paws_api_client_id,
                            secret: data.Plaintext.toString('ascii')
                        };

                        return resolve(PAWS_DECRYPTED_CREDS);
                    }
                });
        }
    });
}

class PawsCollector extends AlAwsCollector {

    static load() {
        return AlAwsCollector.load().then(function(aimsCreds) {

            return getPawsParamStoreParam()
                .then(getDecryptedPawsCredentials)
                .then(pawsCreds => ({aimsCreds, pawsCreds}));
        });
    }

    // we can do whatever conditional handler wrapping here
    static makeHandler(handlerFunc) {
        if(process.env.DD_API_KEY || process.env.DD_KMS_API_KEY){
            return ddLambda.datadog(handlerFunc);
        } else {
            return handlerFunc;
        }
    }

    constructor(context, {aimsCreds, pawsCreds}, childVersion, healthChecks = [], statsChecks = []) {
        const version = childVersion ? childVersion : packageJson.version;
        const endpointDomain = process.env.paws_endpoint.replace(DOMAIN_REGEXP, '');
        super(context, 'paws',
              AlAwsCollector.IngestTypes.LOGMSGS,
              version,
              aimsCreds,
              null, healthChecks, statsChecks);
        console.info('PAWS000100 Loading collector', process.env.paws_type_name);
        this._pawsCreds = pawsCreds;
        this._pawsCollectorType = process.env.paws_type_name;
        this.pollInterval = process.env.paws_poll_interval;
        this._pawsEndpoint = process.env.paws_endpoint
        this._pawsDomainEndpoint = endpointDomain;
        this._pawsHttpsEndpoint = 'https://' + endpointDomain;
    };

    get secret () {
        return this._pawsCreds.secret;
    };

    get clientId () {
        return this._pawsCreds.client_id;
    };

    get authType() {
        return this._pawsCreds.auth_type;
    };
    
    get pawsCollectorType() {
        return this._pawsCollectorType;
    };
    
    get pawsEndpoint() {
        return this._pawsEndpoint;
    };

    get pawsDomainEndpoint() {
        return this._pawsDomainEndpoint;
    };
    
    get pawsHttpsEndpoint() {
        return this._pawsHttpsEndpoint;
    };

    reportDDMetric(name, value, tags = []) {
        // check if the API key is present. This will be a good proxy for if the handler is working
        if (!process.env.DD_API_KEY){
            return
        }

        const baseTags = [
            `paws_platform:${this.pawsCollectorType}`,
            `applicationId:${this.applicationId}`,
            `aws_account:${this.aws_account_id}`
        ];

        ddLambda.sendDistributionMetric(
            `paws_${this.pawsCollectorType}.${name}`,
            value,
            ...baseTags.concat(tags)
        );
    }

    getProperties() {
        const baseProps = super.getProperties();
        let pawsProps = {
            pawsCollectorType : this._pawsCollectorType,
            pawsEndpoint : process.env.paws_endpoint
        };
        return Object.assign(pawsProps, baseProps);
    };

    prepareErrorStatus(errorString, streamName = 'none') {
        return super.prepareErrorStatus(errorString, streamName, this.pawsCollectorType);
    }

    setPawsSecret(secretValue){
        const encryptPromise = new Promise((resolve, reject) => {
            const kms = new AWS.KMS();
            const params = {
                KeyId: process.env.paws_kms_key_arn,
                Plaintext: secretValue
            };
            kms.encrypt(params, function(err, data) {
                if (err) {
                    return reject(err, err.stack);
                }
                const base64 = new Buffer(data.CiphertextBlob).toString('base64');
                return resolve(base64);
            });
        });

        return encryptPromise.then((base64) => {
            return new Promise((resolve, reject) => {
                var ssm = new AWS.SSM();
                var params = {
                    Name: process.env.paws_secret_param_name,
                    Type: 'String',
                    Overwrite: true,
                    Value: base64
                };
                ssm.putParameter(params, function(err, data) {
                    if (err) return reject(err, err.stack);
                    else     return resolve(data);
                });
            }).catch(err => {
                console.error('PAWS000300 Error setting new secret', err);
                return err;
            });
        })
    }

    registerPawsCollector(event, callback) {
        let collector = this;
        let pawsRegisterProps = this.getProperties();
        collector.pawsGetRegisterParameters(event, function(err, customRegister) {
            if (err) {
                console.err('PAWS000101 Error during registration', err);
                return callback(err);
            } else {
                let registerProps = Object.assign(pawsRegisterProps, customRegister);
                AlAwsCollector.prototype.register.call(collector, event, registerProps, callback);
                
            }
        });
    }
    
    register(event, customUnused, callback) {
        let collector = this;

        async.waterfall([
            function(asyncCallback) {
                collector.registerPawsCollector(event, asyncCallback);
            },
            function(regResp, asyncCallback) {
                return collector.pawsInitCollectionState(event, asyncCallback);
            },
            function(state, nextInvocationTimeout, asyncCallback) {
                return collector._storeCollectionState({}, state, nextInvocationTimeout, asyncCallback);
            }
        ],
        callback);
    };
    
    deregister(event, customUnused, callback) {
        let collector = this;
        let pawsRegisterProps = {
            pawsCollectorType : collector._pawsCollectorType
        };
        let custom = collector.pawsGetRegisterParameters(event, function(err, customRegister) {
            if (err) {
                console.warn('PAWS000102 Error during deregistration', err);
            }
            let registerProps = Object.assign(pawsRegisterProps, customRegister);
            return AlAwsCollector.prototype.deregister.call(collector, event, registerProps, callback);
        });
    };

    handleEvent(event) {
        let collector = this;
        if (event.Records) {
            let stateMsg = event.Records[0];
            if (stateMsg.eventSourceARN === process.env.paws_state_queue_arn) {
                return collector.handlePollRequest(stateMsg);
            } else {
                return super.handleEvent(event);
            }
        } else {
            return super.handleEvent(event);
        }
    };
    
    handlePollRequest(stateSqsMsg) {
        let collector = this;
        let pawsState = JSON.parse(stateSqsMsg.body);

        async.waterfall([
            function(asyncCallback) {
                if (!collector.registered) {
                    return asyncCallback('PAWS000103 Collection attempt for unregistrered collector');
                } else {
                    return asyncCallback();
                }
            },
            function(asyncCallback) {
                return collector.pawsGetLogs(pawsState.priv_collector_state, asyncCallback);
            },
            function(logs, privCollectorState, nextInvocationTimeout, asyncCallback) {
                console.info('PAWS000200 Log events received ', logs.length);
                return collector.processLog(logs, collector.pawsFormatLog.bind(collector), null, function(err) {
                    return asyncCallback(err, privCollectorState, nextInvocationTimeout);
                });
            },
            function(privCollectorState, nextInvocationTimeout, asyncCallback) {
                // Try to find last collected message ts in collector private state.
                const lastCollectedTs = 
                    privCollectorState.last_collected_ts ? privCollectorState.last_collected_ts :
                    privCollectorState.since ? privCollectorState.since :
                    privCollectorState.until ? privCollectorState.until :
                    null;
                
                if (lastCollectedTs) {
                    collector.reportCollectionDelay(lastCollectedTs, () => {
                        return asyncCallback(null, privCollectorState, nextInvocationTimeout);
                    });
                } else {
                    return asyncCallback(null, privCollectorState, nextInvocationTimeout);
                }
            },
            function(privCollectorState, nextInvocationTimeout, asyncCallback) {
                return collector._storeCollectionState(pawsState, privCollectorState, nextInvocationTimeout, asyncCallback);
            }
        ], function(error) {
            collector.done(error);
        });
    };

    reportApiThrottling(callback) {
        // TODO: report collector status via Ingest/agentstatus
        var cloudwatch = new AWS.CloudWatch({apiVersion: '2010-08-01'});
        const params = {
            MetricData: [
              {
                MetricName: 'PawsApiThrottling',
                Dimensions: [
                  {
                    Name: 'CollectorType',
                    Value: this._pawsCollectorType
                  },
                  {
                    Name: 'FunctionName',
                    Value: process.env.AWS_LAMBDA_FUNCTION_NAME
                  }
                ],
                Timestamp: new Date(),
                Unit: 'Count',
                Value: 1
              }
            ],
            Namespace: 'PawsCollectors'
        };
        this.reportDDMetric('api_throttling', 1)
        return cloudwatch.putMetricData(params, callback);
    };
    
    reportCollectionDelay(lastCollectedTs, callback) {
        const nowMoment = moment();
        const lastCollectedMoment = moment(lastCollectedTs);
        const delayDuration = moment.duration(nowMoment.diff(lastCollectedMoment));
        const collectionDelaySec = Math.floor(delayDuration.asSeconds());
        
        var cloudwatch = new AWS.CloudWatch({apiVersion: '2010-08-01'});
        const params = {
            MetricData: [
              {
                MetricName: 'CollectionDelay',
                Dimensions: [
                  {
                    Name: 'CollectorType',
                    Value: this._pawsCollectorType
                  },
                  {
                    Name: 'FunctionName',
                    Value: process.env.AWS_LAMBDA_FUNCTION_NAME
                  }
                ],
                Timestamp: new Date(),
                Unit: 'Seconds',
                Value: collectionDelaySec
              }
            ],
            Namespace: 'PawsCollectors'
        };
        this.reportDDMetric('collection_delay', collectionDelaySec);
        return cloudwatch.putMetricData(params, callback);
    };

    _storeCollectionState(pawsState, privCollectorState, invocationTimeout, callback) {
        if (Array.isArray(privCollectorState)) {
            return this._storeCollectionStateArray(pawsState, privCollectorState, invocationTimeout, callback);
        } else {
            return this._storeCollectionStateSingle(pawsState, privCollectorState, invocationTimeout, callback);
        }
    }

    _storeCollectionStateArray(pawsState, privCollectorStates, invocationTimeout, callback) {
        let collector = this;
        var sqs = new AWS.SQS({apiVersion: '2012-11-05'});
        const nextInvocationTimeout = invocationTimeout ? invocationTimeout : collector.pollInterval;
        let SQSMsgs = privCollectorStates.map(function(privState, index) {
            let pState = pawsState;
            pState.priv_collector_state = privState;
            return {
                Id: index.toString(),
                MessageBody: JSON.stringify(pawsState),
                DelaySeconds: nextInvocationTimeout
            };
        });

        var promises = [];
        const SQS_BATCH_LIMIT = 10
        for (let i = 0; i < SQSMsgs.length; i += SQS_BATCH_LIMIT) {
            let params = {
                Entries: SQSMsgs.slice(i, i + SQS_BATCH_LIMIT),
                QueueUrl: process.env.paws_state_queue_url
            };
            let promise = new Promise((resolve, reject) => {
                sqs.sendMessageBatch(params, (err, data) => {
                    if(err) reject(err);
                    resolve(data);
                })
            });
            promises.push(promise);
        }

        // Current state message will be removed by Lambda trigger upon successful completion
        Promise.all(promises)
        .then(results => {
            return callback(null, results);
        }).catch(error => {
            return callback(error);
        });
    }

    _storeCollectionStateSingle(pawsState, privCollectorState, invocationTimeout, callback) {
        let collector = this;
        var sqs = new AWS.SQS({apiVersion: '2012-11-05'});
        const nextInvocationTimeout = invocationTimeout ? invocationTimeout : collector.pollInterval;
        pawsState.priv_collector_state = privCollectorState;

        const params = {
            MessageBody: JSON.stringify(pawsState),
            QueueUrl: process.env.paws_state_queue_url,
            DelaySeconds: nextInvocationTimeout
        };
        // Current state message will be removed by Lambda trigger upon successful completion
        sqs.sendMessage(params, callback);
    };

    /**
     * @function collector callback to initialize collection state
     * @param event - collector register event coming in from CFT.
     * @param callback
     * @returns callback - (error, stateObjectOrArray, nextInvocationTimeoutSec).
     *
     */
    pawsInitCollectionState(event, callback) {
        throw Error("not implemented pawsInitCollectionState()");
    }

    /**
     * @function collector callback to receive logs data
     * @param state - collection state specific to a PAWS collector.
     * @param callback
     * @returns callback - (error, logsArray, stateObjectOrArray, nextInvocationTimeoutSec).
     *
     */
    pawsGetLogs(state, callback) {
        throw Error("not implemented pawsGetLogs()");
    };

    /**
     * @function collector callback to get specific (de)registration parameters
     * @param event - optional, collector register event coming in from CFT during stack Create/Delete operations.
     * @param callback
     * @returns callback - (error, objectWithRegistrationProperties)
     *
     */
    pawsGetRegisterParameters(event, callback) {
        return callback(null, {});
    };

    /**
     * @function collector callback to format received data
     * Refer to al-collector-js.buildPayload parseCallback parameter
     */
    pawsFormatLog() {
        throw Error("not implemented pawsFormatLog()");
    };

}

module.exports = {
    PawsCollector: PawsCollector
}
