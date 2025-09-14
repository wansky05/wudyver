"use client";

import SimpleBar from "simplebar-react";
import { useState, useEffect }. from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Textinput from "@/components/ui/Textinput";
import { ToastContainer, toast } from "react-toastify";
import { Icon } from '@iconify/react';

// Komponen untuk Form Input
const ShortLinkForm = ({ formData, handleInputChange, handleSubmit, loading }) => (
  <Card className="w-full mb-6 border border-teal-500/50 dark:border-teal-600/70 rounded-xl shadow-lg bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm">
    <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700/60">
      <div className="flex items-center">
        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md">
          <Icon icon="ph:link-simple-horizontal-duotone" className="text-2xl" />
        </div>
        <div className="ml-4">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-cyan-500">
            Buat Shortlink Baru
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Persingkat URL Anda dengan mudah dan cepat.
          </p>
        </div>
      </div>
    </div>
    <div className="p-4 sm:p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-teal-700 dark:text-teal-300 mb-2 flex items-center">
            <Icon icon="ph:link-duotone" className="mr-2 text-lg" />
            URL Tujuan
          </label>
          <Textinput
            id="url"
            name="url"
            type="url"
            placeholder="https://example.com/url-yang-sangat-panjang"
            value={formData.url}
            onChange={handleInputChange}
            required
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-teal-700 dark:text-teal-300 mb-2 flex items-center">
            <Icon icon="ph:text-aa-duotone" className="mr-2 text-lg" />
            Custom Short ID (Opsional)
          </label>
          <Textinput
            id="name"
            name="name"
            type="text"
            placeholder="contoh: produk-terbaru"
            value={formData.name}
            onChange={handleInputChange}
            disabled={loading}
          />
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Jika kosong, ID acak akan dibuat otomatis.
          </p>
        </div>
        <Button
          text={loading ? "Processing..." : "Buat Shortlink"}
          icon={loading ? "svg-spinners:ring-resize" : "ph:plus-circle-duotone"}
          className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold"
          disabled={loading || !formData.url}
          type="submit"
        />
      </form>
    </div>
  </Card>
);

// Komponen untuk menampilkan daftar link
const ShortLinkList = ({ links, loading, origin, fetchShortLinks, copyToClipboard, formatDate }) => (
  <Card className="w-full border border-teal-500/50 dark:border-teal-600/70 rounded-xl shadow-lg bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm">
    <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700/60 flex justify-between items-center">
      <div className="flex items-center">
        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md">
          <Icon icon="ph:list-bullets-duotone" className="text-2xl" />
        </div>
        <div className="ml-4">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-cyan-500">
            Daftar Shortlink
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Semua shortlink yang telah Anda buat.
          </p>
        </div>
      </div>
      <Button
        text="Refresh"
        icon="ph:arrow-clockwise-duotone"
        className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
        onClick={fetchShortLinks}
        disabled={loading}
      />
    </div>
    <SimpleBar className="max-h-[calc(100vh-230px)]">
      <div className="p-4 sm:p-6">
        {loading ? (
          <div className="text-center py-10">
            <Icon icon="svg-spinners:blocks-shuffle-3" className="text-4xl text-teal-500 mx-auto mb-3" />
            <p>Memuat data...</p>
          </div>
        ) : links.length === 0 ? (
          <div className="text-center py-10">
            <Icon icon="ph:link-simple-break-duotone" className="text-4xl text-slate-400 mx-auto mb-3" />
            <p className="text-slate-500">Belum ada shortlink yang dibuat.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {links.map((link) => (
              <div key={link._id} className="bg-slate-100/70 dark:bg-slate-800/40 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center mb-1">
                      <span className="font-medium text-teal-600 dark:text-teal-400 truncate">
                        {origin}/s/{link.id}
                      </span>
                      <Button
                        icon="ph:copy-duotone"
                        className="ml-2 p-1.5"
                        onClick={() => copyToClipboard(`${origin}/s/${link.id}`)}
                      />
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      → {link.url}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                      Dibuat: {formatDate(link.createdAt)}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      icon="ph:eye-duotone"
                      className="bg-teal-100 dark:bg-teal-800/30 text-teal-600 dark:text-teal-300"
                      onClick={() => window.open(`${origin}/s/${link.id}`, '_blank')}
                    />
                    <Button
                      icon="ph:trash-duotone"
                      className="bg-red-100 dark:bg-red-800/30 text-red-600 dark:text-red-300"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SimpleBar>
  </Card>
);

// Komponen Utama
const ShortLinkPage = () => {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ url: "", name: "" });
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
    fetchShortLinks();
  }, []);

  const fetchShortLinks = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/shortlinks');
      const result = await response.json();
      if (result.success) {
        setLinks(result.data);
      } else {
        toast.error("Gagal mengambil data shortlink.");
      }
    } catch (error) {
      toast.error("Terjadi kesalahan saat mengambil data.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.url) {
      toast.warn("URL tidak boleh kosong!");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/shortlinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (result.success) {
        toast.success("Shortlink berhasil dibuat!");
        setFormData({ url: "", name: "" });
        fetchShortLinks(); // Muat ulang daftar link
      } else {
        toast.error(result.message || "Gagal membuat shortlink.");
      }
    } catch (error) {
      toast.error("Terjadi kesalahan saat membuat shortlink.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link disalin ke clipboard!");
    } catch (err) {
      toast.error("Gagal menyalin link.");
    }
  };

  const formatDate = (dateString) => {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(dateString));
  };

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} theme="colored" />
      <div className="w-full px-2 sm:px-4 py-6 space-y-6">
        <ShortLinkForm
          formData={formData}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          loading={loading}
        />
        <ShortLinkList
          links={links}
          loading={loading}
          origin={origin}
          fetchShortLinks={fetchShortLinks}
          copyToClipboard={copyToClipboard}
          formatDate={formatDate}
        />
      </div>
    </>
  );
};

export default ShortLinkPage;