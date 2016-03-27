FROM ubuntu:14.04
ARG ozw_version=1.4

RUN apt-get update \
    && apt-get install -y \
		avahi-utils \
		libudev-dev \
		make \
    	nodejs \
		npm \
		pkg-config \
		ssl-cert \
    	wget \
	&& rm -rf /var/lib/apt/lists/* \
	&& ln -s /usr/bin/nodejs /usr/local/bin/node

RUN mkdir -p /src \
	&& wget -O /src/open-zwave.tgz "https://github.com/OpenZWave/open-zwave/archive/v${ozw_version}.tar.gz" \
	&& tar -xzf /src/open-zwave.tgz -C /src \
	&& make -C /src/open-zwave-${ozw_version} \
	&& make -C /src/open-zwave-${ozw_version} install \
	&& rm -R /src

ENV LD_LIBRARY_PATH /usr/local/lib64

WORKDIR /srv
COPY package.json /srv/
RUN npm install

RUN npm install https://github.com/OpenZWave/node-openzwave-shared/tarball/master
COPY *.js /srv/

RUN mkdir -p /data
VOLUME /data
ENTRYPOINT ["./server.js"]
CMD ["-s", "--data-dir", "/data", "--http", "4280", "--events", "4281", "--repl", "4282"]
EXPOSE 4280 4281 4282
